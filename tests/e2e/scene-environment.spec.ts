import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';
import {
    chatMessageIds,
    controlTokens,
    createProbeScene,
    firstNewCard,
    deleteProbeScene,
    type ProbeActorSpec,
    type ProbeScene,
    setSceneEnvironment,
    snapChatCard,
    snapWindow,
    startCombat,
    targetToken,
} from './scene-probe';

/**
 * Tier B — the per-scene environment (#604), driven the way the GM and a player
 * use it on real Foundry:
 *
 *   1. The Environment widget is up on `ready`; the GM's "Set Environment"
 *      button opens the Scene Environment window, whose preview follows the
 *      form, and Save writes the scene flag and refreshes the widget. Closing
 *      the widget is not a one-way door: the scene-control button reopens it.
 *   2. Gravity reaches the character sheet: low gravity raises the movement
 *      rates (Agility Bonus +2), zero gravity halves them.
 *   3. In zero gravity, choosing Charge on the sheet's move-mode cluster during
 *      the character's turn prompts the Hard (−20) Agility test, carried as a
 *      named Environment row on the dialog and the card; choosing Run in the same
 *      turn does not prompt again (one test per manoeuvre per turn); the
 *      widget's explicit button always rolls.
 *   4. Harsh weather puts a −20 row on a weapon attack, and low gravity lengthens
 *      a thrown weapon's SBx3 range (Strength Bonus +2).
 */

const WIDGET = '#wh40k-scene-environment-widget';
const DIALOG = '#wh40k-scene-environment-dialog';
const ROLL_DIALOG = '.unified-roll-dialog';

/** A DH2 acolyte with every characteristic at 40 (all bonuses 4) and an equipped SBx3 throwing knife. */
function acolyte(name: string): ProbeActorSpec {
    const forty = { base: 40, advance: 0, modifier: 0 };
    return {
        name,
        type: 'dh2-character',
        system: {
            gameSystem: 'dh2',
            characteristics: {
                weaponSkill: forty,
                ballisticSkill: forty,
                strength: forty,
                toughness: forty,
                agility: forty,
                intelligence: forty,
                perception: forty,
                willpower: forty,
                fellowship: forty,
            },
        },
        items: [
            {
                name: 'Throwing Knife',
                type: 'weapon',
                system: {
                    class: 'thrown',
                    melee: false,
                    attack: {
                        type: 'thrown',
                        characteristic: 'ballisticSkill',
                        range: { value: 0, units: 'm', special: 'SBx3' },
                        rateOfFire: { single: true, semi: 0, full: 0 },
                    },
                    damage: { formula: '1d5', type: 'rending', bonus: 0, penetration: 0 },
                    // As the packs author a thrown weapon: the item is its one round.
                    clip: { max: 1, value: 1, type: '' },
                    quantity: 1,
                    state: { equipped: true },
                },
            },
        ],
        x: 300,
        y: 300,
    };
}

/** Open the probe actor's sheet on the Combat tab and return its window id. */
async function openCombatTab(page: Page, actorId: string): Promise<string> {
    const sheetId = await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { sheet: { id: string; render: (o: object) => Promise<object> } } | undefined } };
        };
        const sheet = g.game.actors.get(id)?.sheet;
        if (sheet === undefined) return '';
        await sheet.render({ force: true });
        return sheet.id;
    }, actorId);
    expect(sheetId, 'the actor sheet should render').not.toBe('');
    await page.locator(`#${sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
    await expect(page.locator(`#${sheetId} [data-movement-type="half"]`).first()).toBeVisible();
    return sheetId;
}

/** The movement rates the sheet's move-mode cluster shows, by mode. */
async function sheetMovement(page: Page, sheetId: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const mode of ['half', 'full', 'charge', 'run']) {
        // eslint-disable-next-line no-await-in-loop -- four reads of one rendered sheet
        const text = await page.locator(`#${sheetId} [data-movement-type="${mode}"]`).first().innerText();
        out[mode] = (/(\d+(?:\.\d+)?)/.exec(text)?.[1] ?? '').trim();
    }
    return out;
}

/** The number of open unified roll dialogs. */
async function rollDialogCount(page: Page): Promise<number> {
    return page.locator(ROLL_DIALOG).count();
}

/** The move mode a token declares (its `flags.wh40k-rpg.movementAction`), or null. */
async function tokenMoveMode(page: Page, sceneId: string, tokenId: string): Promise<string | null> {
    return page.evaluate(
        (ids) => {
            interface TokenDoc {
                getFlag: (scope: string, key: string) => string | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (id: string) => { tokens: { get: (id: string) => TokenDoc | undefined } } | undefined } };
            };
            return g.game.scenes.get(ids.sceneId)?.tokens.get(ids.tokenId)?.getFlag('wh40k-rpg', 'movementAction') ?? null;
        },
        { sceneId, tokenId },
    );
}

/** Reopen the Environment widget from the WH40K scene-control group's button. */
async function openWidgetFromSceneControls(page: Page): Promise<void> {
    await page.locator('#scene-controls [data-control="wh40k"]').first().click();
    await page.locator('#scene-controls [data-tool="sceneEnvironment"]').first().click();
    await expect(page.locator(WIDGET)).toBeVisible();
}

test.describe.serial('Scene environment (Tier B, #604)', () => {
    test.setTimeout(scaledMs(240_000));
    // A stuck click or fill fails with its locator instead of eating the whole test budget.
    test.use({ actionTimeout: scaledMs(15_000) });

    test('the GM sets a zero-gravity vacuum scene through the widget and its window', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createProbeScene(page, 'Scene Environment Probe — window', [acolyte('Env Probe Acolyte A')]);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            const widget = page.locator(WIDGET);
            await expect(widget).toBeVisible();
            const gravity = widget.locator('[data-wh40k-hook="env-gravity"]');
            await expect(gravity).toHaveAttribute('data-gravity', 'standard');
            await expect(gravity).toHaveText('Standard gravity');
            await expect(widget.locator('[data-wh40k-hook="env-none"]')).toBeVisible();
            await clearScreenOverlays(page, 'wh40k-scene-environment');
            expect(await snap(page, 'scene-env-widget-standard', { selector: WIDGET })).not.toBeNull();

            // Closing the widget is not a one-way door: the scene-control button reopens it.
            await widget.locator('[data-action="close"]').first().click();
            await expect(widget).toBeHidden();
            await openWidgetFromSceneControls(page);

            // The GM's window: the preview follows the form before anything is saved.
            await widget.locator('[data-action="editEnvironment"]').click();
            const dialog = page.locator(DIALOG);
            await expect(dialog).toBeVisible();
            await dialog.locator('select[name="gravity"]').selectOption('zero');
            await expect(dialog.getByText('Difficult terrain: movement halved')).toBeVisible();
            await dialog.locator('input[name="harshConditions"]').check();
            await expect(dialog.getByText('Weapon Skill and Ballistic Skill attack tests -20')).toBeVisible();
            await dialog.locator('select[name="atmosphere"]').selectOption('vacuum');
            await expect(dialog.getByText('Vacuum: resolve exposure with the Environmental Hazards tool')).toBeVisible();
            await expect(gravity, 'nothing is written before Save').toHaveAttribute('data-gravity', 'standard');
            await clearScreenOverlays(page, 'wh40k-scene-environment');
            expect(await snap(page, 'scene-env-dialog-zero-g-vacuum', { selector: DIALOG })).not.toBeNull();

            await dialog.locator('[data-action="save"]').click();
            await expect(dialog).toBeHidden();
            await expect(gravity).toHaveAttribute('data-gravity', 'zero');
            await expect(widget.locator('[data-wh40k-hook="env-atmosphere"]')).toHaveAttribute('data-atmosphere', 'vacuum');
            await expect(widget.locator('[data-action="rollZeroGravity"]')).toBeVisible();
            const stored = await page.evaluate((sceneId: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: { scenes: { get: (id: string) => { getFlag: (s: string, k: string) => object | undefined } | undefined } };
                };
                return g.game.scenes.get(sceneId)?.getFlag('wh40k-rpg', 'environment') ?? null;
            }, probe.sceneId);
            expect(stored).toEqual({ gravity: 'zero', harshConditions: true, atmosphere: 'vacuum' });
            await clearScreenOverlays(page, 'wh40k-scene-environment');
            expect(await snap(page, 'scene-env-widget-zero-g-vacuum', { selector: WIDGET })).not.toBeNull();
            recordCoverage('scene-environment.flow', 'gm-window-save');
        } finally {
            await setSceneEnvironment(page, probe.sceneId, { gravity: 'standard', harshConditions: false, atmosphere: 'breathable' });
            await deleteProbeScene(page, probe);
        }
    });

    test('gravity reaches the sheet: low gravity raises movement, zero gravity halves it', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createProbeScene(page, 'Scene Environment Probe — movement', [acolyte('Env Probe Acolyte B')]);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            const actorId = probe.actorIds[0] ?? '';
            const sheetId = await openCombatTab(page, actorId);
            // Agility Bonus 4: Half 4 / Full 8 / Charge 12 / Run 24.
            await expect.poll(async () => sheetMovement(page, sheetId)).toEqual({ half: '4', full: '8', charge: '12', run: '24' });

            await setSceneEnvironment(page, probe.sceneId, { gravity: 'low', harshConditions: false, atmosphere: 'breathable' });
            // Low gravity: Agility Bonus +2 for movement (6 → 6 / 12 / 18 / 36).
            await expect.poll(async () => sheetMovement(page, sheetId)).toEqual({ half: '6', full: '12', charge: '18', run: '36' });
            await clearScreenOverlays(page, sheetId);
            expect(await snap(page, 'scene-env-sheet-low-gravity-movement', { selector: `#${sheetId}` })).not.toBeNull();

            await setSceneEnvironment(page, probe.sceneId, { gravity: 'zero', harshConditions: false, atmosphere: 'breathable' });
            // Zero gravity: difficult terrain, movement halved.
            await expect.poll(async () => sheetMovement(page, sheetId)).toEqual({ half: '2', full: '4', charge: '6', run: '12' });
            await clearScreenOverlays(page, sheetId);
            expect(await snap(page, 'scene-env-sheet-zero-gravity-movement', { selector: `#${sheetId}` })).not.toBeNull();
            recordCoverage('scene-environment.flow', 'sheet-movement');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });

    test('zero gravity: a Charge prompts the −20 Agility test once per turn; the widget button always rolls', async ({ page }) => {
        await joinOrSkip(page);
        const zeroG = { gravity: 'zero', harshConditions: false, atmosphere: 'breathable' };
        let probe: ProbeScene = await createProbeScene(page, 'Scene Environment Probe — charge', [acolyte('Env Probe Acolyte C')], zeroG);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            const combatId = await startCombat(page, probe.sceneId, probe.tokenIds);
            expect(combatId, 'a combat with the acolyte on turn').not.toBeNull();
            probe = { ...probe, combatId };
            const sheetId = await openCombatTab(page, probe.actorIds[0] ?? '');
            expect(await rollDialogCount(page)).toBe(0);

            // Charge on the move-mode cluster: the zero-gravity Agility test opens.
            await page.locator(`#${sheetId} [data-action="setMovementMode"][data-movement-type="charge"]`).first().click();
            const rollDialog = page.locator(ROLL_DIALOG).first();
            await expect(rollDialog).toBeVisible();
            await expect(rollDialog).toContainText('Zero Gravity: Charge or Run (Agility)');
            // Agility 40, Hard (−20) in zero gravity: the target is 20.
            await expect(rollDialog).toContainText('Base 40');
            await expect(rollDialog).toContainText(/\b20\s*%/);
            expect(await snapWindow(page, 'scene-env-zero-g-charge-dialog', rollDialog)).not.toBeNull();

            const before = await chatMessageIds(page);
            await rollDialog.locator('[data-action="systemRoll"]').click();
            const card = await firstNewCard(page, before);
            expect(card.content).toContain('Zero gravity');
            expect(card.content).toContain('Scene environment');
            expect(await snapChatCard(page, 'scene-env-zero-g-charge-card', card.id)).not.toBeNull();

            // Run in the same turn is the same manoeuvre: no second test.
            const sheetAgain = await openCombatTab(page, probe.actorIds[0] ?? '');
            await page.locator(`#${sheetAgain} [data-action="setMovementMode"][data-movement-type="run"]`).first().click();
            // The token now declares Run (the cluster itself does not re-render on the
            // token update; reported separately), so the hook has seen the declaration.
            await expect.poll(async () => tokenMoveMode(page, probe.sceneId, probe.tokenIds[0] ?? '')).toBe('run');
            await page.waitForTimeout(scaledMs(1500));
            expect(await rollDialogCount(page), 'one zero-gravity test per manoeuvre per turn').toBe(0);
            await clearScreenOverlays(page, sheetAgain);
            // Move the pointer off the Run row so its hover tooltip does not cover the cluster.
            await page.mouse.move(1, 1);
            await page.waitForTimeout(scaledMs(600));
            expect(await snap(page, 'scene-env-zero-g-run-same-turn-no-test', { selector: `#${sheetAgain}` })).not.toBeNull();

            // The widget's explicit button always rolls, for the controlled token.
            await controlTokens(page, probe.tokenIds);
            await openWidgetFromSceneControls(page);
            const widgetButton = page.locator(`${WIDGET} [data-action="rollZeroGravity"]`);
            await expect(widgetButton).toBeVisible();
            await widgetButton.click();
            await expect(page.locator(ROLL_DIALOG).first()).toBeVisible();
            await expect(page.locator(ROLL_DIALOG).first()).toContainText('Zero Gravity: Charge or Run (Agility)');
            recordCoverage('scene-environment.flow', 'zero-g-charge-once-per-turn');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });

    test('harsh weather adds −20 to an attack; low gravity lengthens a thrown SBx3 range', async ({ page }) => {
        await joinOrSkip(page);
        const env = { gravity: 'low', harshConditions: true, atmosphere: 'breathable' };
        // The thrower, and a target 6 m away (inside the 9 m Short Range).
        const target: ProbeActorSpec = { ...acolyte('Env Probe Target'), items: [], x: 900 };
        let probe: ProbeScene = await createProbeScene(page, 'Scene Environment Probe — attack', [acolyte('Env Probe Acolyte D'), target], env);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            const combatId = await startCombat(page, probe.sceneId, probe.tokenIds);
            probe = { ...probe, combatId };
            await controlTokens(page, [probe.tokenIds[0] ?? '']);
            await targetToken(page, probe.tokenIds[1] ?? '');
            const actorId = probe.actorIds[0] ?? '';
            const knifeId = await page.evaluate((id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: { actors: { get: (i: string) => { items: { contents: Array<{ id: string; type: string }> } } | undefined } };
                };
                return g.game.actors.get(id)?.items.contents.find((i) => i.type === 'weapon')?.id ?? '';
            }, actorId);
            expect(knifeId).not.toBe('');
            // The DH2 character sheet lists weapons without a roll control; the owned
            // weapon's own sheet carries the Attack button.
            const weaponSheetId = await page.evaluate(
                async (ids) => {
                    interface SheetDoc {
                        sheet: { id: string; render: (o: object) => Promise<object> };
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                    const g = globalThis as unknown as {
                        game: { actors: { get: (i: string) => { items: { get: (i: string) => SheetDoc | undefined } } | undefined } };
                    };
                    const sheet = g.game.actors.get(ids.actorId)?.items.get(ids.knifeId)?.sheet;
                    if (sheet === undefined) return '';
                    await sheet.render({ force: true });
                    return sheet.id;
                },
                { actorId, knifeId },
            );
            expect(weaponSheetId, 'the owned weapon sheet should render').not.toBe('');
            const attack = page.locator(`#${weaponSheetId} [data-action="rollAttack"]:visible`).first();
            await expect(attack).toBeVisible();
            await attack.click();

            const rollDialog = page.locator(ROLL_DIALOG).first();
            await expect(rollDialog).toBeVisible();
            // Strength Bonus 4 + 2 in low gravity = 6, so SBx3 = 18 m: Short Range is up
            // to half of it (9 m) and Long Range up to three times it (54 m). Standard
            // gravity would give 12 m (6 m / 36 m).
            await rollDialog.locator('[data-action="toggleRangeSection"]').first().click();
            await expect(rollDialog.locator('[data-action="selectRangeBracket"]').last()).toBeVisible();
            const brackets = (await rollDialog.locator('[data-action="selectRangeBracket"]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
            expect(brackets, `range brackets: ${brackets}`).toContain('Short Range ≤9m');
            expect(brackets, `range brackets: ${brackets}`).toContain('Long Range ≤54m');
            expect(await snapWindow(page, 'scene-env-harsh-weather-thrown-range-dialog', rollDialog)).not.toBeNull();

            // The attack card carries the harsh-weather −20 as a named Environment row.
            const before = await chatMessageIds(page);
            await rollDialog.locator('[data-action="systemRoll"]').click();
            const card = await firstNewCard(page, before);
            expect(card.content).toContain('Harsh conditions');
            expect(card.content).toContain('Scene environment');
            expect(await snapChatCard(page, 'scene-env-harsh-weather-attack-card', card.id)).not.toBeNull();
            recordCoverage('scene-environment.flow', 'harsh-weather-thrown-range');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });
});
