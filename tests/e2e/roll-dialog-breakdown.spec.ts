import type { Page } from '@playwright/test';
import {
    attackWith,
    awaitCard,
    awaitRollDialog,
    type ChatCard,
    clickInCard,
    closeWindow,
    createActor,
    deleteDocuments,
    enterRoll,
    messageIds,
    prepareStage,
    restoreSettings,
    selectAttackMode,
    setWorldSettings,
    settledTarget,
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
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — the Roll Test dialog shows every component of its target, the rows the
 * card will print (#489), the passive-effects note names the right base (#525),
 * the burst bonus is the line's own (#607), and a Gen 1 card prints the line's own
 * degrees (#335). Every roll is opened the way the table does it: from the weapon
 * sheet's Attack card, or from the Parry button on an evasion prompt.
 *
 *   1. Parry (DH2): the parrying weapon's Balanced row and an `onParry` hook row are
 *      breakdown rows, and the rows sum to the target.
 *   2. Environment (DH2): in a zero-gravity, storm-lashed scene the attack shows
 *      the harsh-conditions −20 row, and the zero-gravity Agility test the GM rolls
 *      from the environment widget shows its −20 row; the shooter's passive BS
 *      talent sits under a note that says "characteristic", not "skill".
 *   3. DH1 burst + degrees: Semi-Auto Burst is +10 on the mode card and on its
 *      breakdown row (DH1 core p. 191); a 01 posts a card that prints DH1's count,
 *      one degree per full 10 points of margin.
 *   4. DH2 burst: Full Auto Burst stays −10.
 *   5. Fitting a weapon modification from the weapon sheet: the parts'
 *      Availability (Scarce, −10) is its own row.
 *
 * Each case records a `roll-dialog.flow` coverage key; keep ROLL_DIALOG_FLOWS in
 * sync with the denominator in scripts/e2e-coverage.mjs.
 */

const ROLL_DIALOG_FLOWS = ['parry-rows', 'environment-rows', 'passive-note', 'dh1-burst-and-degrees', 'dh2-full-auto', 'fit-availability'] as const;

const CHAINSWORD_UUID = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.z5A6b7C8d9E0f1G2';
const DH2_AUTOGUN_UUID = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.r5S6t7U8v9W0x1Y2';
const DH1_AUTOGUN_UUID = 'Compendium.wh40k-rpg.dh1-core-items-weapons.Item.r5S6t7U8v9W0x1Y2';
/** A test-only talent whose `onParry` hook must reach the Parry dialog as its own row. */
const PARRY_DRILL = 'E2E Parry Drill';
/** A test-only talent whose flat BS bonus is folded into the characteristic (a passive row). */
const STEADY_HANDS = 'E2E Steady Hands';

/** One breakdown row as the dialog renders it. */
interface BreakdownRow {
    key: string;
    text: string;
    /** The signed value parsed off the row's text. */
    value: number;
    hoverable: boolean;
}

/** The open dialog's base, rows and target (the target read after its count-up settles). */
interface Breakdown {
    base: number;
    rows: BreakdownRow[];
    target: number;
}

async function readBreakdown(page: Page, dialogId: string): Promise<Breakdown> {
    const target = (await settledTarget(page, dialogId)) ?? Number.NaN;
    const read = await page.evaluate((id) => {
        const root = document.getElementById(id);
        const baseText = root?.querySelector('[data-wh40k-hook="target-base"]')?.textContent ?? '';
        const rows = Array.from(root?.querySelectorAll<HTMLElement>('[data-wh40k-hook="target-component"]') ?? [], (row) => {
            const text = row.textContent.replace(/\s+/g, ' ').trim();
            return {
                key: row.dataset['componentKey'] ?? '',
                text,
                value: Number(/([+-]\d+)$/.exec(text)?.[1] ?? Number.NaN),
                hoverable: row.dataset['wh40kTooltip'] === 'modifier' && (row.dataset['wh40kTooltipData'] ?? '') !== '',
            };
        });
        return { base: Number(/(\d+)\s*$/.exec(baseText)?.[1] ?? Number.NaN), rows };
    }, dialogId);
    return { ...read, target };
}

/** The rows sum to the target (no hidden component), and every row is hoverable. */
function expectAccountedFor(breakdown: Breakdown, label: string): void {
    const sum = breakdown.rows.reduce((total, row) => total + row.value, 0);
    // A target never drops below 0 (the dialog floors it, as the card does).
    expect(Math.max(0, breakdown.base + sum), `${label}: base + rows = target`).toBe(breakdown.target);
    for (const row of breakdown.rows) expect(row.hoverable, `${label}: "${row.text}" is hoverable to its source`).toBe(true);
}

/** Capture the dialog's target block (the hero number and its breakdown) at a readable size. */
async function snapTargetBlock(page: Page, label: string, dialogId: string): Promise<string | null> {
    await settledTarget(page, dialogId);
    await clearScreenOverlays(page, dialogId);
    return snap(page, label, { selector: `#${dialogId} [data-wh40k-hook="target-breakdown"] >> xpath=..` });
}

function character(line: 'dh1' | 'dh2', name: string, characteristics: object): object {
    return { name, type: `${line}-character`, img: 'icons/svg/mystery-man.svg', system: { gameSystem: line, characteristics } };
}

/** Set the viewed scene's environment flag (the GM's environment control writes the same flag). */
async function setSceneEnvironment(page: Page, sceneId: string, environment: object): Promise<void> {
    await page.evaluate(
        async ({ id, env }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { setFlag: (s: string, k: string, v: object) => Promise<object> } | undefined } };
            };
            await g.game.scenes.get(id)?.setFlag('wh40k-rpg', 'environment', env);
        },
        { id: sceneId, env: environment },
    );
}

test.describe.serial('Roll Test dialog target breakdown (Tier B)', () => {
    test('Parry: the parrying weapon and onParry rows are on the breakdown, and sum to the target (#489)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false });
        const attacker = await createActor(page, {
            data: character('dh2', 'Heretic Duellist', { weaponSkill: { base: 55, advance: 0, modifier: 0 } }),
            compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }],
        });
        const defender = await createActor(page, {
            data: character('dh2', 'Lucius Varn', { weaponSkill: { base: 30, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } }),
            compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }],
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
        const stage = await stageScene(page, 'Breakdown duel', [
            { actorId: attacker.id, x: 400, y: 300 },
            { actorId: defender.id, x: 500, y: 300 },
        ]);
        const combatId = await startCombat(page, stage.sceneId, [
            { actorId: attacker.id, initiative: 20 },
            { actorId: defender.id, initiative: 10 },
        ]);
        try {
            await targetActor(page, defender.id);
            const before = await messageIds(page);
            const attackDialog = await attackWith(page, attacker.id, attacker.items['Chainsword'] ?? '');
            await enterRoll(page, attackDialog, 12);
            await submitRoll(page, attackDialog);
            const prompt = await awaitCard(page, before, 'data-evasion-prompt');

            await clickInCard(page, prompt.id, '.roll-control__evade[data-skill="parry"]');
            const parryDialog = await awaitRollDialog(page);
            const breakdown = await readBreakdown(page, parryDialog);
            const texts = breakdown.rows.map((row) => row.text);
            expect(
                texts.some((text) => text.startsWith('Balanced (Chainsword)')),
                `the parrying weapon's quality is a row: ${texts.join(' | ')}`,
            ).toBe(true);
            expect(
                texts.some((text) => text.startsWith(PARRY_DRILL)),
                `the onParry hook is a row: ${texts.join(' | ')}`,
            ).toBe(true);
            expect(breakdown.target, 'the target is above the bare base').toBeGreaterThan(breakdown.base);
            expectAccountedFor(breakdown, 'parry');
            expect(await snapTargetBlock(page, 'roll-dialog-parry-breakdown', parryDialog)).not.toBeNull();
            expect(await snapWindow(page, 'roll-dialog-parry-window', parryDialog)).not.toBeNull();
            await closeWindow(page, parryDialog);
            recordCoverage('roll-dialog.flow', 'parry-rows');
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { combats: [combatId], scenes: [stage.sceneId], actors: [attacker.id, defender.id] });
        }
    });

    test('Environment: zero gravity and harsh conditions are rows; the passive note says "characteristic" (#489, #525)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false, 'require-combat-to-attack': false });
        const shooter = await createActor(page, {
            data: character('dh2', 'Void-born Sharpshooter', {
                ballisticSkill: { base: 50, advance: 0, modifier: 0 },
                agility: { base: 40, advance: 0, modifier: 0 },
            }),
            compendiumItems: [{ uuid: DH2_AUTOGUN_UUID, equip: true }],
            items: [{ name: STEADY_HANDS, type: 'talent', system: { modifiers: { characteristics: { ballisticSkill: 5 } } } }],
        });
        const stage = await stageScene(page, 'Breakdown void', [{ actorId: shooter.id, x: 400, y: 300 }]);
        try {
            await setSceneEnvironment(page, stage.sceneId, { gravity: 'zero', harshConditions: true, atmosphere: 'breathable' });
            // Harsh conditions make a WS / BS attack test Hard: a row on the attack.
            const dialogId = await attackWith(page, shooter.id, shooter.items['Autogun'] ?? '');
            const breakdown = await readBreakdown(page, dialogId);
            const harsh = breakdown.rows.find((row) => row.key.endsWith('harsh-conditions'));
            expect(harsh?.value, `the harsh-conditions row shows: ${breakdown.rows.map((r) => r.text).join(' | ')}`).toBe(-20);
            expectAccountedFor(breakdown, 'environment');
            expect(await snapTargetBlock(page, 'roll-dialog-environment-breakdown', dialogId)).not.toBeNull();

            // The passive BS bonus is folded into the characteristic, so the note says so.
            const note = page.locator(`#${dialogId} [data-wh40k-hook="passive-modifier-note"]`);
            await expect(note).toHaveText('Included in base characteristic.');
            await expect(page.locator(`#${dialogId}`)).toContainText(STEADY_HANDS);
            await clearScreenOverlays(page, dialogId);
            expect(
                await snap(page, 'roll-dialog-passive-note-weapon', { selector: `#${dialogId} [data-wh40k-hook="passive-modifier-note"] >> xpath=..` }),
            ).not.toBeNull();
            await closeWindow(page, dialogId);
            recordCoverage('roll-dialog.flow', 'passive-note');

            // Zero gravity makes a Charge or Run a Hard Agility test: the GM rolls it from
            // the environment widget for the controlled token, and the −20 is its own row.
            await page.evaluate((actorId) => {
                interface TokenLike {
                    actor: { id: string } | null;
                    control: (options: object) => boolean;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` global has no browser-side types
                const g = globalThis as unknown as { canvas: { tokens: { placeables: TokenLike[] } } };
                g.canvas.tokens.placeables.find((t) => t.actor?.id === actorId)?.control({ releaseOthers: true });
            }, shooter.id);
            // The capture above closed the floating windows; the GM reopens the widget from the scene controls.
            const widget = page.locator('#wh40k-scene-environment-widget');
            if (!(await widget.isVisible())) {
                await page.locator('#scene-controls [data-control="wh40k"]').first().click();
                await page.locator('#scene-controls [data-tool="sceneEnvironment"]').first().click();
            }
            await widget.locator('[data-action="rollZeroGravity"]').click();
            const zeroGDialog = await awaitRollDialog(page);
            const zeroG = await readBreakdown(page, zeroGDialog);
            const gravityRow = zeroG.rows.find((row) => row.key.endsWith('zero-gravity'));
            expect(gravityRow?.value, `the zero-gravity row shows: ${zeroG.rows.map((r) => r.text).join(' | ')}`).toBe(-20);
            expectAccountedFor(zeroG, 'zero gravity');
            expect(await snapTargetBlock(page, 'roll-dialog-zero-gravity-breakdown', zeroGDialog)).not.toBeNull();
            await closeWindow(page, zeroGDialog);
            recordCoverage('roll-dialog.flow', 'environment-rows');
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { scenes: [stage.sceneId], actors: [shooter.id] });
        }
    });

    test('DH1: Semi-Auto Burst is +10, and a 01 prints DH1 degrees on the card (#607, #335)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false, 'require-combat-to-attack': false });
        const shooter = await createActor(page, {
            data: character('dh1', 'Guardsman Thale', { ballisticSkill: { base: 65, advance: 0, modifier: 0 } }),
            compendiumItems: [{ uuid: DH1_AUTOGUN_UUID, equip: true }],
        });
        try {
            const dialogId = await attackWith(page, shooter.id, shooter.items['Autogun'] ?? '');
            await selectAttackMode(page, dialogId, 'semiAuto');
            // The header names the picked action; then move the pointer off the card so its tooltip does not cover the capture.
            await expect(page.locator(`#${dialogId} [data-wh40k-hook="roll-subtitle"]`)).toHaveText('Semi-Auto Burst');
            await page.mouse.move(1, 1);
            const semiCard = page.locator(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="semiAuto"]`);
            await expect(semiCard, 'the mode card shows DH1’s +10').toContainText('+10');
            await expect(page.locator(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="fullAuto"]`), 'and Full Auto +20').toContainText('+20');
            const breakdown = await readBreakdown(page, dialogId);
            const burstRow = breakdown.rows.find((row) => row.key === 'combat-action');
            expect(burstRow?.value, `the burst bonus is its own row: ${breakdown.rows.map((r) => r.text).join(' | ')}`).toBe(10);
            expectAccountedFor(breakdown, 'dh1 semi-auto');
            expect(await snapWindow(page, 'roll-dialog-dh1-semi-auto', dialogId)).not.toBeNull();

            const before = await messageIds(page);
            await enterRoll(page, dialogId, 1);
            await submitRoll(page, dialogId);
            const card: ChatCard = await awaitCard(page, before, 'data-wh40k-hook="degrees-count"');
            // DH1: one degree per full 10 points by which the roll beats the target, no base degree.
            const printed = Math.floor((breakdown.target - 1) / 10);
            expect(card.html, `DH1 prints ${printed} DoS for 01 vs ${breakdown.target}`).toContain(`data-wh40k-hook="degrees-count">${printed}<`);
            expect(card.html, 'the readout shows the Gen 1 count').toContain(`${printed} DoS = ⌊${breakdown.target - 1} ÷ 10⌋`);
            expect(await snapCard(page, 'roll-dialog-dh1-degrees-card', card.id)).not.toBeNull();
            recordCoverage('roll-dialog.flow', 'dh1-burst-and-degrees');
        } finally {
            await restoreSettings(page, settings);
            await deleteDocuments(page, { actors: [shooter.id] });
        }
    });

    test('DH2: Full Auto Burst stays −10 (#607)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'require-combat-to-attack': false });
        const shooter = await createActor(page, {
            data: character('dh2', 'Interrogator Vane', { ballisticSkill: { base: 45, advance: 0, modifier: 0 } }),
            compendiumItems: [{ uuid: DH2_AUTOGUN_UUID, equip: true }],
        });
        try {
            const dialogId = await attackWith(page, shooter.id, shooter.items['Autogun'] ?? '');
            await selectAttackMode(page, dialogId, 'fullAuto');
            await expect(page.locator(`#${dialogId} [data-wh40k-hook="roll-subtitle"]`)).toHaveText('Full Auto Burst');
            await page.mouse.move(1, 1);
            await expect(page.locator(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="fullAuto"]`)).toContainText('-10');
            await expect(page.locator(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="semiAuto"]`)).toContainText('+0');
            const breakdown = await readBreakdown(page, dialogId);
            expect(breakdown.rows.find((row) => row.key === 'combat-action')?.value).toBe(-10);
            expectAccountedFor(breakdown, 'dh2 full-auto');
            expect(await snapWindow(page, 'roll-dialog-dh2-full-auto', dialogId)).not.toBeNull();
            await closeWindow(page, dialogId);
            recordCoverage('roll-dialog.flow', 'dh2-full-auto');
        } finally {
            await restoreSettings(page, settings);
            await deleteDocuments(page, { actors: [shooter.id] });
        }
    });

    test('Fitting a modification: the Availability row is on the breakdown (#489, #136)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const fitter = await createActor(page, {
            data: {
                ...character('dh2', 'Enginseer Probe', { intelligence: { base: 40, advance: 0, modifier: 0 } }),
                system: {
                    gameSystem: 'dh2',
                    characteristics: { intelligence: { base: 40 } },
                    skills: { trade: { entries: [{ name: 'Armourer', advance: 2 }] } },
                },
            },
            items: [
                { name: 'Probe Autogun', type: 'weapon', system: { class: 'basic', type: 'solid-projectile', equipped: true } },
                // Scarce parts (DH2 core p. 164): the fitting test takes the line's Availability modifier.
                { name: 'Red-Dot Laser Sight', type: 'weaponModification', system: { availability: 'scarce' } },
            ],
        });
        try {
            const sheetId = await page.evaluate(
                async ({ actorId, weaponId }) => {
                    interface Sheet {
                        id: string;
                        render: (force: boolean) => Promise<object>;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                    const g = globalThis as unknown as {
                        game: { actors: { get: (id: string) => { items: { get: (id: string) => { sheet: Sheet } | undefined } } | undefined } };
                    };
                    const weaponSheet = g.game.actors.get(actorId)?.items.get(weaponId)?.sheet;
                    if (weaponSheet === undefined) throw new Error('weapon sheet unavailable');
                    await weaponSheet.render(true);
                    await globalThis.wh40kE2E.waitFor(() => document.getElementById(weaponSheet.id) !== null, 'the weapon sheet');
                    return weaponSheet.id;
                },
                { actorId: fitter.id, weaponId: fitter.items['Probe Autogun'] ?? '' },
            );
            const sheet = page.locator(`#${sheetId}`);
            if ((await sheet.locator('.wh40k-weapon-body.collapsed').count()) > 0) await sheet.locator('[data-action="toggleBody"]').click();
            await sheet.locator('[data-action="fitModification"]').click();
            const dialogId = await awaitRollDialog(page);
            await closeWindow(page, sheetId);
            const breakdown = await readBreakdown(page, dialogId);
            const availability = breakdown.rows.find((row) => row.key === 'modification-availability');
            expect(availability?.value, `the Availability is its own row: ${breakdown.rows.map((r) => r.text).join(' | ')}`).toBe(-10);
            expectAccountedFor(breakdown, 'fit');
            expect(await snapTargetBlock(page, 'roll-dialog-fit-availability-breakdown', dialogId)).not.toBeNull();
            await closeWindow(page, dialogId);
            recordCoverage('roll-dialog.flow', 'fit-availability');
        } finally {
            await deleteDocuments(page, { actors: [fitter.id] });
        }
    });

    test('every flow has a case', () => {
        expect(ROLL_DIALOG_FLOWS).toHaveLength(6);
    });
});
