import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of weapons whose damage is not one fixed profile, through real
 * attacks on a live canvas:
 *
 * - **No damage (#601)** — the DH2 Bolas prints "—" for damage. Its hit card shows
 *   "No Damage" where Roll Damage would be and no damage dice are rolled; its weapon
 *   chat card has no Damage button (a Hand Flamer's does); its sheet shows the dash.
 * - **Range bands (#608)** — the DH1 Conversion Beamer's damage grows with range.
 *   Fired at a target 5 m away and at one 25 m away, each damage card names the band
 *   it used (hoverable provenance row) and rolls that band's dice.
 *
 * Every card and both weapon sheets are captured.
 *
 * Grid: 100 px = 1 m. Each flow records under `damage-profile.flow`. Keys MUST match
 * DAMAGE_PROFILE_FLOWS in scripts/e2e-coverage.mjs.
 */

const DAMAGE_PROFILE_FLOWS = ['no-damage-attack-card', 'no-damage-weapon-card', 'no-damage-sheet-dash', 'band-near-damage', 'band-far-damage'] as const;

type FlowName = (typeof DAMAGE_PROFILE_FLOWS)[number];

const BOLAS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.1w94jpt1uzmfph00';
const HAND_FLAMER = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.j7K8l9M0n1O2p3Q4';
const CONVERSION_BEAMER = 'Compendium.wh40k-rpg.dh1-daemonhunter-items-weapons.Item.804d243ba234097d';

const marksman = { characteristics: { ballisticSkill: { base: 60 }, strength: { base: 40 } } };

const TOKENS = [
    {
        key: 'snarer',
        name: 'Snarer',
        type: 'dh2-character',
        x: 100,
        y: 600,
        items: [leanWeapon('Bolas', BOLAS, 1), leanWeapon('Hand Flamer', HAND_FLAMER, 2)],
        system: marksman,
    },
    { key: 'quarry', name: 'Quarry', type: 'dh2-npc', x: 600, y: 600 },
    { key: 'beamer', name: 'Beamer', type: 'dh1-character', x: 100, y: 100, items: [leanWeapon('Conversion Beamer', CONVERSION_BEAMER, 4)], system: marksman },
    { key: 'near', name: 'Near Target', type: 'dh1-npc', x: 600, y: 100 },
    { key: 'far', name: 'Far Target', type: 'dh1-npc', x: 2600, y: 100 },
];

interface MessageView {
    id: string;
    hasRollDamage: boolean;
    hasNoDamage: boolean;
    hasWeaponDamageButton: boolean;
    profileKind: string | null;
    profileLabel: string;
    formulas: string[];
}

async function readMessages(page: Page, ids: readonly string[]): Promise<MessageView[]> {
    return page.evaluate(async (messageIds: readonly string[]): Promise<MessageView[]> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { rolls: Array<{ formula: string }> } | undefined } } };
        const views: MessageView[] = [];
        for (const id of messageIds) {
            const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each card is read once it renders
            await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
            const card = document.querySelector(sel);
            const profile = card?.querySelector<HTMLElement>('[data-damage-profile]') ?? null;
            views.push({
                id,
                hasRollDamage: card?.querySelector('.roll-control__roll-damage') !== null,
                hasNoDamage: card?.querySelector('[data-no-damage]') !== null,
                hasWeaponDamageButton: card?.querySelector('[data-action="rollDamage"]') !== null,
                profileKind: profile?.dataset['damageProfile'] ?? null,
                profileLabel: profile?.querySelector('span:last-child')?.textContent.trim() ?? '',
                formulas: (g.game.messages.get(id)?.rolls ?? []).map((r) => r.formula),
            });
        }
        return views;
    }, ids);
}

/** The slice of an owned weapon item these probes touch. */
interface WeaponItemLike {
    name: string;
    sendToChat: () => Promise<{ id: string } | undefined>;
    sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object> };
}

interface ActorsGlobal {
    game: { actors: { get: (i: string) => { items: { contents: WeaponItemLike[] } } | undefined } };
}

/** Post a weapon's item chat card; returns the message id. */
async function postWeaponCard(page: Page, actorId: string, weaponName: string): Promise<string | null> {
    return page.evaluate(
        async (args: { actorId: string; weaponName: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ActorsGlobal;
            const item = g.game.actors.get(args.actorId)?.items.contents.find((i) => i.name === args.weaponName);
            const message = await item?.sendToChat();
            return message?.id ?? null;
        },
        { actorId, weaponName },
    );
}

/** Open a weapon's sheet; returns its app id and the damage figure it shows. */
async function openWeaponSheet(page: Page, actorId: string, weaponName: string): Promise<{ appId: string; damage: string } | null> {
    return page.evaluate(
        async (args: { actorId: string; weaponName: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ActorsGlobal;
            const item = g.game.actors.get(args.actorId)?.items.contents.find((i) => i.name === args.weaponName);
            if (item === undefined) return null;
            await item.sheet.render({ force: true });
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            await waitFor(() => item.sheet.rendered, `${args.weaponName} sheet`, scale(10_000));
            const damage = document.querySelector(`#${item.sheet.id} [data-action="rollDamage"] span.tw-font-display`)?.textContent.trim() ?? '';
            return { appId: item.sheet.id, damage };
        },
        { actorId, weaponName },
    );
}

async function setSetting(page: Page, key: string, value: boolean): Promise<boolean> {
    return page.evaluate(
        async (args: { key: string; value: boolean }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { settings: { get: (n: string, k: string) => boolean; set: (n: string, k: string, v: boolean) => Promise<boolean> } };
            };
            const was = g.game.settings.get('wh40k-rpg', args.key);
            await g.game.settings.set('wh40k-rpg', args.key, args.value);
            return was;
        },
        { key, value },
    );
}

async function snapCard(page: Page, label: string, messageId: string): Promise<void> {
    const selector = await popOutChatMessage(page, messageId);
    await snap(page, label, { selector });
}

/** Fire the beamer at one target and roll its damage from the hit card; returns the damage card. */
async function beamAt(page: Page, scene: HarnessScene, targetKey: string, damageFaces: Array<[number, number]>): Promise<MessageView | null> {
    const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
        firer: scene.tokens['beamer'] ?? '',
        target: scene.tokens[targetKey] ?? '',
        weaponName: 'Conversion Beamer',
        faces: [[5, 100]] as Array<[number, number]>,
    });
    const attackViews = await readMessages(page, attack.messageIds);
    // The defender's evasion window holds auto-damage (#414); the GM's Roll Damage rolls over it.
    let damageViews = attackViews.filter((v) => v.profileKind !== null);
    const hitCard = attackViews.find((v) => v.hasRollDamage);
    if (damageViews.length === 0 && hitCard !== undefined) {
        const posted = await page.evaluate(
            async (args) =>
                globalThis.wh40kAttack.clickInMessage({
                    messageId: args.id,
                    buttonSelector: '.roll-control__roll-damage',
                    faces: args.faces,
                    expectMessages: 1,
                }),
            { id: hitCard.id, faces: damageFaces },
        );
        damageViews = (await readMessages(page, posted)).filter((v) => v.profileKind !== null);
    }
    return damageViews.at(0) ?? null;
}

test.describe.serial('no-damage and range-band damage profiles (Tier B, #601, #608)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a no-damage weapon rolls nothing, and a band weapon rolls the band its range falls in', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);

        const results = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            results.set(flow, ok ? null : detail);
        };
        const autoApplyWas = await setSetting(page, 'auto-apply-damage', false);
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 3000, height: 900, tokens }), TOKENS);
            const snarerId = scene.actors['snarer'] ?? '';
            const beamerId = scene.actors['beamer'] ?? '';

            // --- #601: the Bolas hits and rolls nothing -----------------------------
            const snare = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['snarer'] ?? '',
                target: scene.tokens['quarry'] ?? '',
                weaponName: 'Bolas',
                faces: [[5, 100]] as Array<[number, number]>,
            });
            const snareViews = await readMessages(page, snare.messageIds);
            const hitCard = snareViews.find((v) => v.hasNoDamage);
            const damageDice = snareViews.flatMap((v) => v.formulas).filter((f) => !f.includes('d100'));
            pass(
                'no-damage-attack-card',
                hitCard !== undefined && !hitCard.hasRollDamage && damageDice.length === 0,
                `bolas messages ${JSON.stringify(snareViews)}; non-d100 rolls ${JSON.stringify(damageDice)}; notices ${snare.notices.join(' | ')}`,
            );
            if (hitCard !== undefined) await snapCard(page, 'damage-no-damage-attack-card', hitCard.id);

            const bolasCardId = await postWeaponCard(page, snarerId, 'Bolas');
            const flamerCardId = await postWeaponCard(page, snarerId, 'Hand Flamer');
            const cards = await readMessages(page, [bolasCardId ?? '', flamerCardId ?? '']);
            const bolasCard = cards.at(0);
            const flamerCard = cards.at(1);
            pass(
                'no-damage-weapon-card',
                bolasCard !== undefined && flamerCard !== undefined && !bolasCard.hasWeaponDamageButton && flamerCard.hasWeaponDamageButton,
                `bolas card damage button ${String(bolasCard?.hasWeaponDamageButton)}, hand flamer ${String(flamerCard?.hasWeaponDamageButton)}`,
            );
            if (bolasCardId !== null) await snapCard(page, 'damage-no-damage-weapon-card', bolasCardId);
            if (flamerCardId !== null) await snapCard(page, 'damage-hand-flamer-weapon-card', flamerCardId);

            const bolasSheet = await openWeaponSheet(page, snarerId, 'Bolas');
            pass(
                'no-damage-sheet-dash',
                bolasSheet !== null && /^[-–—]$/u.test(bolasSheet.damage),
                `bolas sheet damage reads "${bolasSheet?.damage ?? 'no sheet'}"`,
            );
            if (bolasSheet !== null)
                await snap(page, 'damage-no-damage-weapon-sheet', { selector: `#${bolasSheet.appId}`, closeWindows: true, keepWindow: bolasSheet.appId });

            // --- #608: the Conversion Beamer's band follows the range ----------------
            const near = await beamAt(page, scene, 'near', [[6, 10]]);
            pass(
                'band-near-damage',
                near !== null && near.profileKind === 'band' && near.formulas.some((f) => f.startsWith('1d10')),
                `near damage card ${JSON.stringify(near)}`,
            );
            if (near !== null) await snapCard(page, 'damage-band-near-card', near.id);
            const far = await beamAt(page, scene, 'far', [
                [6, 10],
                [3, 10],
                [8, 10],
            ]);
            pass(
                'band-far-damage',
                far !== null && far.profileKind === 'band' && far.formulas.some((f) => f.startsWith('3d10')) && far.profileLabel !== near?.profileLabel,
                `far damage card ${JSON.stringify(far)}`,
            );
            if (far !== null) await snapCard(page, 'damage-band-far-card', far.id);
            const beamerSheet = await openWeaponSheet(page, beamerId, 'Conversion Beamer');
            if (beamerSheet !== null)
                await snap(page, 'damage-band-weapon-sheet', { selector: `#${beamerSheet.appId}`, closeWindows: true, keepWindow: beamerSheet.appId });
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await setSetting(page, 'auto-apply-damage', autoApplyWas);
        }

        const failures: string[] = [];
        for (const flow of DAMAGE_PROFILE_FLOWS) {
            const detail = results.get(flow);
            if (detail === null) recordCoverage('damage-profile.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
