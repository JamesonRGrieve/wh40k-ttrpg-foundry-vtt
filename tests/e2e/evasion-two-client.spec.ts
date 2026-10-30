import type { Page } from '@playwright/test';
import {
    attackWith,
    awaitCard,
    awaitRollDialog,
    type ChatCard,
    anyNewCard,
    cardHtml,
    clickInCard,
    createActor,
    createPlayer,
    deleteDocuments,
    enterRoll,
    messageIds,
    nextTurn,
    prepareStage,
    restoreSettings,
    selectAttackMode,
    setWorldSettings,
    settledTarget,
    snapCard,
    stageScene,
    startCombat,
    submitRoll,
    targetActor,
    viewScene,
} from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsUser, joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { expect, test } from './lib/test';

/**
 * Tier B — the evasion window across clients, the way the table plays it (#414).
 *
 * Three Foundry sessions on one world: the GM, the defending player, and a second
 * player who owns nothing in the fight. The GM's DH2 autogunner fires Semi-Auto
 * Bursts at a character the defending player owns, inside a started combat; every
 * d100 is entered by hand, so every outcome is fixed.
 *
 *   1. The hit opens the window on the GM's attack card, and the defending player is
 *      prompted on their own client: the whispered prompt arrives in their chat and a
 *      notification names the attack.
 *   2. The bystander gets neither: the whisper never reaches their client.
 *   3. The player Dodges with one degree of success: the GM's attack card re-renders
 *      with the hits negated and damage still to roll on the rest.
 *   4. A second burst in the same round finds the Reaction spent: the window is closed
 *      with the reason, and no prompt reaches the player.
 *   5. On the defender's own turn the Reaction is back: a Dodge with a wide margin
 *      negates every hit, and the GM's card reads Evaded with no Roll Damage.
 *
 * Each step records an `evasion.two-client.flow` coverage key; keep TWO_CLIENT_FLOWS
 * in sync with the denominator in scripts/e2e-coverage.mjs.
 */

const TWO_CLIENT_FLOWS = ['owner-prompted', 'bystander-not-prompted', 'partial-dodge', 'reaction-spent', 'full-evade'] as const;

const AUTOGUN_UUID = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'r5S6t7U8v9W0x1Y2');
const DEFENDER_PLAYER = 'E2E Defending Player';
const BYSTANDER_PLAYER = 'E2E Bystander';

interface Fight {
    attackerId: string;
    defenderId: string;
    weaponId: string;
}

/** The outcome an evasion card carries, read on the client that posted the attack. */
interface Outcome {
    hitsLanded: number;
    negated: number;
    remaining: number;
}

/** Fire a Semi-Auto Burst at the defender from the GM's client with a fixed d100; returns the attack card. */
async function burst(gm: Page, fight: Fight, roll: number): Promise<ChatCard> {
    await targetActor(gm, fight.defenderId);
    const before = await messageIds(gm);
    const dialogId = await attackWith(gm, fight.attackerId, fight.weaponId);
    await selectAttackMode(gm, dialogId, 'semiAuto');
    await enterRoll(gm, dialogId, roll);
    await submitRoll(gm, dialogId);
    return awaitCard(gm, before, 'data-evasion-status="');
}

/** Click Dodge on the prompt in the player's own chat and roll it: `roll` maps the dialog's target to the d100 entered. */
async function dodge(player: Page, prompt: ChatCard, roll: (target: number) => number): Promise<ChatCard> {
    const before = await messageIds(player);
    await clickInCard(player, prompt.id, '.roll-control__evade[data-skill="dodge"]');
    const dialogId = await awaitRollDialog(player);
    const target = (await settledTarget(player, dialogId)) ?? 0;
    expect(target, 'the Dodge test has a target to roll under').toBeGreaterThan(1);
    await enterRoll(player, dialogId, roll(target));
    await submitRoll(player, dialogId);
    return awaitCard(player, before, 'data-roll-effect');
}

/** The evasion outcome the GM's client sees on an evasion card. */
async function outcomeOf(gm: Page, cardId: string): Promise<Outcome | null> {
    await gm.waitForFunction(
        (id) =>
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.messages` has no browser-side types
            (globalThis as unknown as { game: { messages: { get: (i: string) => object | undefined } } }).game.messages.get(id) !== undefined,
        cardId,
    );
    return gm.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ChatMessage.getFlag` returns an untyped flag payload
        const g = globalThis as unknown as {
            game: { messages: { get: (i: string) => { getFlag: (s: string, k: string) => Outcome | undefined } | undefined } };
        };
        return g.game.messages.get(id)?.getFlag('wh40k-rpg', 'evasionOutcome') ?? null;
    }, cardId);
}

/**
 * On one client, whether the evasion prompt posted after `before` is visible to its user and drawn
 * in their chat log. Waits for the document to arrive first (every client receives it).
 */
async function promptVisibility(client: Page, before: readonly string[]): Promise<{ visible: boolean; rendered: boolean }> {
    return client.evaluate(async (seen) => {
        interface Message {
            id: string;
            content: string;
            visible: boolean;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.messages` has no browser-side types
        const g = globalThis as unknown as { game: { messages: { contents: Message[] } } };
        const known = new Set(seen);
        const newPrompt = (): Message | undefined => g.game.messages.contents.find((m) => !known.has(m.id) && m.content.includes('data-evasion-prompt'));
        await globalThis.wh40kE2E.waitFor(() => newPrompt() !== undefined, 'the evasion prompt document to arrive');
        const message = newPrompt();
        const id = message?.id ?? '';
        return { visible: message?.visible ?? true, rendered: document.querySelector(`#chat .message[data-message-id="${id}"]`) !== null };
    }, before);
}

test.describe.serial('Evasion across clients (Tier B, DH2)', () => {
    test('the defender’s owner is prompted on their own client, a bystander is not; Dodge negates hits; the Reaction gates the window (#414)', async ({
        page,
        openClient,
    }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false });
        const playerId = await createPlayer(page, DEFENDER_PLAYER);
        const bystanderId = await createPlayer(page, BYSTANDER_PLAYER);
        const attacker = await createActor(page, {
            data: {
                name: 'Heretic Autogunner',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                system: { gameSystem: 'dh2', characteristics: { ballisticSkill: { base: 75, advance: 0, modifier: 0 } } },
            },
            compendiumItems: [{ uuid: AUTOGUN_UUID, equip: true }],
        });
        const defender = await createActor(page, {
            data: {
                name: 'Acolyte Mira Kell',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                ownership: { default: 0, [playerId]: 3 },
                system: { gameSystem: 'dh2', characteristics: { agility: { base: 60, advance: 0, modifier: 0 } } },
            },
        });
        const stage = await stageScene(page, 'Evasion across clients', [
            { actorId: attacker.id, x: 400, y: 300 },
            { actorId: defender.id, x: 700, y: 300 },
        ]);
        const combatId = await startCombat(page, stage.sceneId, [
            { actorId: attacker.id, initiative: 20 },
            { actorId: defender.id, initiative: 10 },
        ]);
        const fight: Fight = { attackerId: attacker.id, defenderId: defender.id, weaponId: attacker.items['Autogun'] ?? '' };
        try {
            expect(fight.weaponId, 'the attacker holds the autogun').not.toBe('');
            const player = await openClient();
            const bystander = await openClient();
            expect(await joinAsUser(player, DEFENDER_PLAYER), 'the defending player joins on their own client').toBe(true);
            expect(await joinAsUser(bystander, BYSTANDER_PLAYER), 'the bystander joins on their own client').toBe(true);
            await prepareStage(player);
            await prepareStage(bystander);

            /* ---- 1. The hit prompts the defender's owner on their own client ---- */
            const playerBefore = await messageIds(player);
            const bystanderBefore = await messageIds(bystander);
            const first = await burst(page, fight, 1);
            expect(first.html, 'the burst hits and opens the evasion window').toContain('data-evasion-status="pending"');
            const prompt = await awaitCard(player, playerBefore, 'data-evasion-prompt');
            expect(prompt.html).toContain('data-skill="dodge"');
            expect(prompt.html, 'the burst lands three hits').toContain('3 hits incoming');
            const notice = player.locator('#notifications .notification', { hasText: 'is hit by Heretic Autogunner' });
            await expect(notice, 'the defender’s client raises a notification for the attack').toBeVisible();
            expect(await snapCard(player, 'evasion-two-client-player-prompt', prompt.id)).not.toBeNull();
            recordCoverage('evasion.two-client.flow', 'owner-prompted');

            /* ---- 2. The bystander is not shown the whisper ---- */
            // Foundry delivers a whisper's document to every client and each client hides
            // it unless it is a recipient (ChatMessage#visible), so what a bystander
            // must not get is the prompt in their chat and the notification.
            await expect
                .poll(async () => (await messageIds(bystander)).includes(first.id), { message: 'the bystander sees the public attack card' })
                .toBe(true);
            expect(await promptVisibility(bystander, bystanderBefore), 'the prompt is hidden from a player who does not own the target').toEqual({
                visible: false,
                rendered: false,
            });
            await expect(bystander.locator('#notifications .notification', { hasText: 'is hit by' })).toHaveCount(0);
            recordCoverage('evasion.two-client.flow', 'bystander-not-prompted');

            /* ---- 3. A Dodge with one degree of success: some hits negated, damage on the rest ---- */
            // Rolling the target itself passes with exactly one degree (DH2 counts tens digits).
            const partial = await dodge(player, prompt, (target) => target);
            const partialOutcome = await outcomeOf(page, partial.id);
            expect(partialOutcome, 'the GM’s client reads the evasion outcome').not.toBeNull();
            expect(partialOutcome?.hitsLanded).toBe(3);
            expect(partialOutcome?.negated ?? 0, 'the Dodge negates at least the hit').toBeGreaterThan(0);
            expect(partialOutcome?.remaining ?? 0, 'one degree leaves hits to land').toBeGreaterThan(0);
            await expect
                .poll(async () => cardHtml(page, first.id), { message: 'the GM’s attack card re-renders resolved' })
                .toContain('data-evasion-status="resolved"');
            const resolved = await cardHtml(page, first.id);
            expect(resolved).toContain(`negates ${String(partialOutcome?.negated)} of 3 hits`);
            expect(resolved, 'damage is still offered for the hits that land').toContain('roll-control__roll-damage');
            expect(await snapCard(page, 'evasion-two-client-gm-partial', first.id)).not.toBeNull();
            recordCoverage('evasion.two-client.flow', 'partial-dodge');

            /* ---- 4. Same round: the Reaction is spent, the window closed, no prompt ---- */
            const playerBeforeSecond = await messageIds(player);
            const second = await burst(page, fight, 1);
            expect(second.html, 'the spent Reaction closes the window').toContain('data-evasion-status="blocked"');
            expect(second.html).toContain('already used their Reaction this round');
            expect(await anyNewCard(player, playerBeforeSecond, 'data-evasion-prompt'), 'no prompt for a Reaction already spent').toBe(false);
            expect(await snapCard(page, 'evasion-two-client-reaction-spent', second.id)).not.toBeNull();
            recordCoverage('evasion.two-client.flow', 'reaction-spent');

            /* ---- 5. The defender's turn: the Reaction is back, and a wide Dodge evades every hit ---- */
            await nextTurn(page, combatId);
            const playerBeforeThird = await messageIds(player);
            const third = await burst(page, fight, 1);
            expect(third.html).toContain('data-evasion-status="pending"');
            const thirdPrompt = await awaitCard(player, playerBeforeThird, 'data-evasion-prompt');
            const full = await dodge(player, thirdPrompt, () => 1);
            const fullOutcome = await outcomeOf(page, full.id);
            expect(fullOutcome?.remaining, 'a wide Dodge negates the whole burst').toBe(0);
            await expect.poll(async () => cardHtml(page, third.id)).toContain('data-evasion-status="resolved"');
            const evaded = await cardHtml(page, third.id);
            expect(evaded, 'the GM’s card reads Evaded').toContain('Evaded');
            expect(evaded, 'a fully evaded attack offers no damage').not.toContain('roll-control__roll-damage');
            expect(await snapCard(page, 'evasion-two-client-gm-evaded', third.id)).not.toBeNull();
            recordCoverage('evasion.two-client.flow', 'full-evade');
            expect(TWO_CLIENT_FLOWS).toHaveLength(5);
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { combats: [combatId], scenes: [stage.sceneId], actors: [attacker.id, defender.id], users: [playerId, bystanderId] });
        }
    });
});
