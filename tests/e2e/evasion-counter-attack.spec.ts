import type { Page } from '@playwright/test';
import { overflowingLabels } from '../../src/module/testing/label-fit';
import {
    actorFlag,
    attackWith,
    awaitCard,
    awaitRollDialog,
    type ChatCard,
    cardControl,
    cardHtml,
    clickInCard,
    createActor,
    deleteDocuments,
    enterRoll,
    messageIds,
    nextTurn,
    prepareStage,
    restoreSettings,
    setActorFlag,
    setWorldSettings,
    snapCard,
    snapWindow,
    stageScene,
    startCombat,
    submitRoll,
    targetActor,
    viewScene,
} from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { expect, test } from './lib/test';

/**
 * Tier B — the evasion window and Counter Attack, driven the way the table plays
 * them (#414, #603, #120).
 *
 * Two DH2 characters face each other on a scene inside a started combat: an
 * attacker, and a defender holding a Balanced chainsword, the Counter Attack talent
 * and a test talent with an `onParry` hook. The GM targets the defender, opens the
 * attacker's weapon sheet, clicks Attack and enters the d100 in the Roll Test
 * dialog (manual dice, so every outcome is fixed). From there:
 *
 *   1. The hit whispers the evasion prompt (Dodge / Parry / Take the hit).
 *   2. Parry: the defender's dialog carries the parrying weapon's Balanced row and
 *      the onParry hook row; the Parry card evades the hit and offers Counter
 *      Attack; the attack card re-renders with the hit negated.
 *   3. Counter Attack: its dialog carries the talent's −20; the counter-attack card
 *      posts and the use is stamped with the combat round.
 *   4. On the defender's own turn (Reaction back, same round): Take the hit posts
 *      the declined card and the attack keeps its hit; then a second successful
 *      Parry earns no Counter Attack, and its card says the talent is spent.
 *   5. A defender held in a grapple cannot react: the attack card shows the window
 *      closed with the reason, and no prompt is whispered (#120).
 *
 * Each flow records an `evasion.flow` coverage key; keep EVASION_FLOWS in sync with
 * the denominator in scripts/e2e-coverage.mjs.
 */

const EVASION_FLOWS = ['prompt', 'parry-negates', 'counter-attack', 'take-hit', 'counter-attack-spent', 'grapple-blocked'] as const;

const CHAINSWORD_UUID = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'z5A6b7C8d9E0f1G2');
const COUNTER_ATTACK_UUID = compendiumUuid({ line: 'dh2', category: 'talents' }, 'DH2aTlnt00000006');
/** A test-only talent whose `onParry` hook must reach the Parry test as a sourced row. */
const PARRY_DRILL = 'E2E Parry Drill';

interface Duel {
    attackerId: string;
    defenderId: string;
    attackerWeaponId: string;
    combatId: string;
}

function dh2Character(name: string, weaponSkill: number): object {
    return {
        name,
        type: 'dh2-character',
        img: 'icons/svg/mystery-man.svg',
        system: {
            gameSystem: 'dh2',
            characteristics: { weaponSkill: { base: weaponSkill, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } },
        },
    };
}

/** Attack the defender with a fixed d100; returns the attack card and its whispered prompt (null when none). */
async function attackDefender(page: Page, duel: Duel, roll: number): Promise<{ attack: ChatCard; prompt: ChatCard | null }> {
    await targetActor(page, duel.defenderId);
    const before = await messageIds(page);
    const dialogId = await attackWith(page, duel.attackerId, duel.attackerWeaponId);
    await enterRoll(page, dialogId, roll);
    await submitRoll(page, dialogId);
    // `data-evasion-status="` is the attack card's block; the prompt's status line carries the bare attribute.
    const attack = await awaitCard(page, before, 'data-evasion-status="');
    const prompt = attack.html.includes('data-evasion-status="pending"') ? await awaitCard(page, before, 'data-evasion-prompt') : null;
    return { attack, prompt };
}

/** Click Parry on a prompt and roll it with a fixed d100; returns the Parry card. */
async function parry(page: Page, prompt: ChatCard, roll: number, dialogLabel: string | null): Promise<ChatCard> {
    const before = await messageIds(page);
    await clickInCard(page, prompt.id, '.roll-control__evade[data-skill="parry"]');
    const dialogId = await awaitRollDialog(page);
    await enterRoll(page, dialogId, roll);
    if (dialogLabel !== null) expect(await snapWindow(page, dialogLabel, dialogId)).not.toBeNull();
    await submitRoll(page, dialogId);
    return awaitCard(page, before, 'data-roll-effect');
}

test.describe.serial('Evasion and Counter Attack (Tier B, DH2)', () => {
    test('prompt → Parry negates the hit → Counter Attack → Take the hit → spent for the round → grappled (#414, #603, #120)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false });
        const attacker = await createActor(page, { data: dh2Character('Heretic Duellist', 55), compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }] });
        const defender = await createActor(page, {
            data: dh2Character('Lucius Varn', 50),
            compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }, { uuid: COUNTER_ATTACK_UUID }],
            items: [
                {
                    name: PARRY_DRILL,
                    type: 'talent',
                    system: {
                        modifiers: { dynamicModifiers: [{ target: 'skill', targetKey: 'parry', mode: 'add', when: 'onParry', value: 5, label: PARRY_DRILL }] },
                    },
                },
            ],
        });
        const stage = await stageScene(page, 'Evasion duel', [
            { actorId: attacker.id, x: 400, y: 300 },
            { actorId: defender.id, x: 500, y: 300 },
        ]);
        const combatId = await startCombat(page, stage.sceneId, [
            { actorId: attacker.id, initiative: 20 },
            { actorId: defender.id, initiative: 10 },
        ]);
        const duel: Duel = { attackerId: attacker.id, defenderId: defender.id, attackerWeaponId: attacker.items['Chainsword'] ?? '', combatId };
        try {
            expect(duel.attackerWeaponId, 'the attacker holds the chainsword').not.toBe('');

            /* ---- 1. The hit whispers the evasion prompt ---- */
            const first = await attackDefender(page, duel, 12);
            expect(first.attack.html, 'the attack card opens the evasion window').toContain('data-evasion-status="pending"');
            expect(first.prompt, 'a hit whispers the defender an evasion prompt').not.toBeNull();
            const prompt = first.prompt as ChatCard;
            expect(prompt.html).toContain('data-skill="dodge"');
            expect(prompt.html).toContain('data-skill="parry"');
            expect(prompt.html).toContain('roll-control__take-hit');
            // One hit reads in the singular, not "hit(s)" (#414).
            expect(prompt.html).toContain('1 hit incoming');
            expect(prompt.html).not.toContain('(s)');
            expect(await snapCard(page, 'evasion-prompt', prompt.id)).not.toBeNull();
            recordCoverage('evasion.flow', 'prompt');

            /* ---- 2. Parry: the weapon-quality and onParry rows, the hit negated, Counter Attack offered ---- */
            const parryCard = await parry(page, prompt, 8, 'evasion-parry-dialog');
            expect(parryCard.html, 'the parrying weapon’s Balanced quality is a sourced row').toContain('Balanced (Chainsword)');
            expect(parryCard.html, 'the onParry hook reaches the Parry test as its own row').toContain(PARRY_DRILL);
            expect(parryCard.html, 'the Parry evades the attack').toContain('evades the attack');
            expect(parryCard.html, 'a successful Parry offers Counter Attack').toContain('roll-control__counter-attack');
            expect(await snapCard(page, 'evasion-parry-card-counter-offer', parryCard.id)).not.toBeNull();
            // #603: at chat width the Counter Attack label stays inside its button.
            expect(await page.locator(cardControl(parryCard.id, '.roll-control__counter-attack')).evaluateAll(overflowingLabels)).toEqual([]);
            await expect
                .poll(async () => cardHtml(page, first.attack.id), { message: 'the attack card re-renders resolved' })
                .toContain('data-evasion-status="resolved"');
            expect(await cardHtml(page, first.attack.id)).toContain('evades the attack');
            expect(await snapCard(page, 'evasion-attack-card-negated', first.attack.id)).not.toBeNull();
            recordCoverage('evasion.flow', 'parry-negates');

            /* ---- 3. Counter Attack: the talent's −20 on the strike back ---- */
            const beforeCounter = await messageIds(page);
            await clickInCard(page, parryCard.id, '.roll-control__counter-attack');
            const counterDialogId = await awaitRollDialog(page);
            await enterRoll(page, counterDialogId, 9);
            expect(await snapWindow(page, 'evasion-counter-attack-dialog', counterDialogId)).not.toBeNull();
            await submitRoll(page, counterDialogId);
            const counter = await awaitCard(page, beforeCounter, 'data-evasion-status="');
            expect(counter.html, 'the strike back carries the talent as its sourced −20 row').toContain('Counter Attack');
            expect(counter.html).toContain('-20');
            expect(await snapCard(page, 'evasion-counter-attack-card', counter.id)).not.toBeNull();
            expect(await actorFlag(page, defender.id, 'counterAttackUsed'), 'the per-round use is stamped with the combat round').toEqual({
                combatId,
                round: 1,
            });
            recordCoverage('evasion.flow', 'counter-attack');

            /* ---- 4. The defender's own turn, same round: its Reaction is back ---- */
            await nextTurn(page, combatId);

            // 4a. Take the hit spends no Reaction: the declined card, and the attack keeps its hit.
            const declinedAttack = await attackDefender(page, duel, 14);
            expect(declinedAttack.prompt, 'the defender has its Reaction back on its own turn').not.toBeNull();
            const beforeDecline = await messageIds(page);
            await clickInCard(page, declinedAttack.prompt?.id ?? '', '.roll-control__take-hit');
            const declined = await awaitCard(page, beforeDecline, 'data-evasion-declined');
            expect(declined.html).toContain('takes the hit');
            expect(await snapCard(page, 'evasion-declined-card', declined.id)).not.toBeNull();
            await expect.poll(async () => cardHtml(page, declinedAttack.attack.id)).toContain('data-evasion-status="resolved"');
            expect(await cardHtml(page, declinedAttack.attack.id), 'no hit was negated').toContain('takes the hit');
            recordCoverage('evasion.flow', 'take-hit');

            // 4b. A second successful Parry this round: no second Counter Attack, and the card says why.
            const second = await attackDefender(page, duel, 15);
            expect(second.prompt, 'Take the hit left the Reaction unspent').not.toBeNull();
            const secondParry = await parry(page, second.prompt as ChatCard, 7, null);
            expect(secondParry.html, 'the Parry still evades').toContain('evades the attack');
            expect(secondParry.html, 'Counter Attack is not offered twice in one round').not.toContain('roll-control__counter-attack');
            expect(secondParry.html, 'the card says why').toContain('data-counter-attack-spent');
            expect(secondParry.html).toContain('Counter Attack already used this round');
            expect(await snapCard(page, 'evasion-counter-attack-spent', secondParry.id)).not.toBeNull();
            recordCoverage('evasion.flow', 'counter-attack-spent');

            /* ---- 5. A grappled defender cannot react: the window is closed, no prompt (#120) ---- */
            await setActorFlag(page, defender.id, 'grapple', { state: 'controlled' });
            const grappled = await attackDefender(page, duel, 13);
            expect(grappled.attack.html, 'the window is closed by the grapple').toContain('data-evasion-status="blocked"');
            expect(grappled.attack.html).toContain('participants in a grapple cannot use Reactions');
            expect(grappled.prompt, 'no prompt is whispered to a defender who cannot react').toBeNull();
            expect(await snapCard(page, 'evasion-grapple-blocked', grappled.attack.id)).not.toBeNull();
            recordCoverage('evasion.flow', 'grapple-blocked');
            expect(EVASION_FLOWS).toHaveLength(6);
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { combats: [combatId], scenes: [stage.sceneId], actors: [attacker.id, defender.id] });
        }
    });
});
