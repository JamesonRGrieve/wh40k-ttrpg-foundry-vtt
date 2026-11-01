import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B: the character sheet's Overview layout as a player sees it.
 *
 *   - Wounds: the value/max total sits beside the Wounds label and the hearts keep
 *     to the row's right margin. A second auto-margin on the total centred them.
 *   - Origin badges: an origin whose image is missing shows its step icon, not the
 *     origin's name clipped by the circle ("Quarant… World").
 */

/**
 * A path the server does not serve. (A removed legacy `systems/wh40k-rpg/icons/…`
 * path is repointed to a served icon when an item is created, so it cannot stand in
 * for the stored items that still carry one.)
 */
const MISSING_IMG = 'assets/e2e-missing/quarantine-world.png';

/** A long origin name, as long as the one reported clipped. */
const ORIGIN_NAME = 'E2E Quarantined Frontier World';

/** The hearts' right edge may sit this far inside the row's (sub-pixel rounding). */
const EDGE_TOLERANCE_PX = 2;

const ACOLYTE = {
    name: 'Layout Acolyte',
    type: 'dh2-character',
    system: { gameSystem: 'dh2', wounds: { max: 13, value: 13 } },
    // A name the compendium join cannot match, so the item keeps its own (missing) image.
    items: [{ name: ORIGIN_NAME, type: 'originPath', img: MISSING_IMG, system: { gameSystem: 'dh2', step: 'homeWorld', stepIndex: 1 } }],
};

const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';

test.describe.serial('Overview vitals and origin badges layout (Tier B)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('the wounds total sits by its label and the hearts keep to the right margin', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, ACOLYTE);
        const vitals = page.locator(`#${sheetId} ${VITALS}`);
        const total = vitals.locator('[data-wh40k-hook="wounds-total"]');
        await expect(total).toHaveText(/^\d+\/\d+$/);

        const layout = await total.evaluate((el) => {
            const row = el.parentElement;
            const hearts = [...(row?.querySelectorAll<HTMLElement>('[data-action="setWoundPip"]') ?? [])];
            return {
                label: el.previousElementSibling?.textContent.trim() ?? '',
                rowRight: row?.getBoundingClientRect().right ?? 0,
                heartsRight: Math.max(...hearts.map((h) => h.getBoundingClientRect().right)),
                heartsLeft: Math.min(...hearts.map((h) => h.getBoundingClientRect().left)),
                totalRight: el.getBoundingClientRect().right,
                hearts: hearts.length,
            };
        });
        expect(layout.label).toBe('Wounds');
        expect(layout.hearts).toBeGreaterThan(0);
        expect(layout.rowRight - layout.heartsRight).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
        expect(layout.totalRight).toBeLessThan(layout.heartsLeft);
        await snapElement(page, 'overview-vitals-wounds-row', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('sheet.section', 'overview.vitals-wounds-layout');
    });

    test('an origin badge whose image is missing shows its step icon, not a clipped name', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, ACOLYTE);
        const badge = page.locator(`#${sheetId} [data-action="itemEdit"][aria-label="${ORIGIN_NAME}"]`).first();
        await expect(badge).toBeVisible();
        // The art is a background over the step icon: no <img> to draw alt text or a
        // broken-image glyph, and the missing art leaves the icon showing.
        await expect(badge.locator('img')).toHaveCount(0);
        await expect(badge.locator('[data-wh40k-hook="origin-art"]')).toHaveAttribute('style', new RegExp(MISSING_IMG.replace(/[.]/g, '\\.')));
        await expect(badge.locator('i.fas')).toBeVisible();
        expect((await badge.innerText()).trim()).toBe('');
        await snapElement(page, 'origin-badge-missing-image', `#${sheetId} .window-content`, sheetId);
        recordCoverage('sheet.section', 'sidebar.origin-badges');
    });
});
