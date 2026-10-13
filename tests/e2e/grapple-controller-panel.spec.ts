import type { Page } from '@playwright/test';
import { actorFlag, createActor, deleteDocuments, openActorSheet, prepareStage, snapWindow } from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — the Grapple Controller Panel on both sides of a grapple (#120 —
 * core.md L10155-10180).
 *
 * Two DH2 characters are in one grapple: the controller (`grappling`) and the one
 * held (`controlled`), each read from `flags['wh40k-rpg'].grapple.state` (the
 * single reader, `readGrappleState`). Each sheet's Overview tab shows the panel
 * with its own state badge and the five opposed-Strength actions. The held
 * character clicks Break Free; the opposed Strength test is rolled with fixed dice
 * (a 05 against the opponent's 99), the grapple ends, and the panel leaves the
 * sheet. That a held character cannot Dodge or Parry is covered on the attack card
 * by evasion-counter-attack.spec.ts.
 *
 * Each state records a `grapple.flow` coverage key; keep GRAPPLE_FLOWS in sync with
 * the denominator in scripts/e2e-coverage.mjs.
 */

const GRAPPLE_FLOWS = ['controller-panel', 'controlled-panel', 'break-free'] as const;

const PANEL = '[data-wh40k-hook="grapple-panel"]';

/** The panel's state attribute, badge and action count on a sheet, or null when it is absent. */
async function readPanel(page: Page, sheetId: string): Promise<{ state: string; badge: string; actions: number } | null> {
    return page.evaluate(
        ({ id, selector }) => {
            const panel = document.getElementById(id)?.querySelector<HTMLElement>(selector);
            if (panel === null || panel === undefined) return null;
            return {
                state: panel.dataset['grappleState'] ?? '',
                badge: panel.querySelector('header > span')?.textContent.trim() ?? '',
                actions: panel.querySelectorAll('button[data-action^="grapple"]').length,
            };
        },
        { id: sheetId, selector: PANEL },
    );
}

/** Feed Foundry's dice these d100 faces in order (then restore the RNG once they are drawn). */
async function fixD100(page: Page, faces: number[]): Promise<void> {
    await page.evaluate((queue) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `CONFIG.Dice` has no browser-side types
        const dice = (globalThis as unknown as { CONFIG: { Dice: { randomUniform: () => number } } }).CONFIG.Dice;
        const original = dice.randomUniform;
        const pending = [...queue];
        dice.randomUniform = (): number => {
            const face = pending.shift();
            if (pending.length === 0) dice.randomUniform = original;
            // Foundry maps a uniform u to the face ceil((1 − u) × faces) (DiceTerm#mapRandomFace).
            return face === undefined ? original() : 1 - (face - 0.5) / 100;
        };
    }, faces);
}

test.describe.serial('Grapple controller panel (Tier B, #120)', () => {
    test('both sides show the panel; Break Free ends the grapple and the panel leaves', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const character = (name: string, state: string): object => ({
            name,
            type: 'dh2-character',
            img: 'icons/svg/mystery-man.svg',
            system: { gameSystem: 'dh2', characteristics: { strength: { base: 40, advance: 0, modifier: 0 } } },
            flags: { 'wh40k-rpg': { grapple: { state } } },
        });
        const controller = await createActor(page, { data: character('Grappling Enforcer', 'grappling') });
        const held = await createActor(page, { data: character('Held Heretic', 'controlled') });
        try {
            // The controller's side.
            const controllerSheet = await openActorSheet(page, controller.id, 'overview');
            await expect(page.locator(`#${controllerSheet} ${PANEL}`)).toBeVisible();
            expect(await readPanel(page, controllerSheet)).toEqual({ state: 'grappling', badge: 'Grappling', actions: 5 });
            await page.locator(`#${controllerSheet} ${PANEL}`).scrollIntoViewIfNeeded();
            expect(await snapWindow(page, 'grapple-controller-sheet', controllerSheet)).not.toBeNull();
            expect(await snap(page, 'grapple-controller-panel', { selector: `#${controllerSheet} ${PANEL}` })).not.toBeNull();
            recordCoverage('grapple.flow', 'controller-panel');

            // The held side.
            const heldSheet = await openActorSheet(page, held.id, 'overview');
            await expect(page.locator(`#${heldSheet} ${PANEL}`)).toBeVisible();
            expect(await readPanel(page, heldSheet)).toEqual({ state: 'controlled', badge: 'Controlled', actions: 5 });
            await page.locator(`#${heldSheet} ${PANEL}`).scrollIntoViewIfNeeded();
            expect(await snapWindow(page, 'grapple-controlled-sheet', heldSheet)).not.toBeNull();
            expect(await snap(page, 'grapple-controlled-panel', { selector: `#${heldSheet} ${PANEL}` })).not.toBeNull();
            recordCoverage('grapple.flow', 'controlled-panel');

            // Break Free: 05 against the opponent's 99 wins the opposed Strength test.
            await fixD100(page, [5, 99]);
            await page.locator(`#${heldSheet} [data-wh40k-hook="grapple-break-btn"]`).click();
            await expect.poll(async () => actorFlag(page, held.id, 'grapple'), { message: 'Break Free ends the grapple' }).toEqual({ state: 'none' });
            await expect(page.locator(`#${heldSheet} ${PANEL}`)).toHaveCount(0);
            expect(await snapWindow(page, 'grapple-broken-free-sheet', heldSheet)).not.toBeNull();
            recordCoverage('grapple.flow', 'break-free');
            expect(GRAPPLE_FLOWS).toHaveLength(3);
        } finally {
            await deleteDocuments(page, { actors: [controller.id, held.id] });
        }
    });
});
