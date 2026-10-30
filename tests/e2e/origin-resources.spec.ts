import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, readActorSystem, showSheetTab, snapElement } from './occult-sheet-flow';

/**
 * Tier B coverage of origin resources (#42): an origin's `modifiers.resources`
 * Wounds / Fate reach the character. The origin-grant ledger used to read
 * `modifiers.wounds` / `modifiers.fate`, a shape no origin document has, so the
 * world-ready reconcile never applied any origin's resources.
 *
 * Each test drops a real compendium origin on a fresh character, rejoins the
 * world (its `ready` runs the origin-grant reconcile), then reads the sheet's
 * vitals — and rejoins once more to prove the reconcile does not stack it.
 */

const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';
const OW_AGRI_WORLD = compendiumUuid({ line: 'ow', category: 'origins-homeworlds' }, '3422efadd4703be1');
const RT_FORTUNE = compendiumUuid({ line: 'rt', category: 'origins-motivations' }, 'Sw4y6TekvknMmLBo');

/** Drop `origin` on a fresh `type` character and let a world boot apply it; returns its ids. */
async function boot(page: Page, name: string, type: string, system: object, origin: string): Promise<{ actorId: string; sheetId: string }> {
    const ids = await openProbeSheet(page, { name, type, system });
    await snapElement(page, `origin-resources-${name.toLowerCase().replace(/\s+/gu, '-')}-before`, `#${ids.sheetId} ${VITALS}`, ids.sheetId);
    await addCompendiumItems(page, ids.actorId, [origin]);
    await joinOrSkip(page);
    return ids;
}

test.describe.serial('Origin resources (Tier B)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test("Only War Agri-World's +2 Wounds raise the maximum, once", async ({ page }) => {
        const { actorId, sheetId } = await boot(page, 'Agri Worlder', 'ow-character', { gameSystem: 'ow', wounds: { max: 10, value: 10 } }, OW_AGRI_WORLD);
        await expect.poll(async () => readActorSystem(page, actorId, 'wounds.max')).toBe(12);

        await showSheetTab(page, actorId, 'overview');
        await expect(page.locator(`#${sheetId} ${VITALS}`)).toContainText('/12');
        await snapElement(page, 'origin-resources-agri-worlder-after', `#${sheetId} ${VITALS}`, sheetId);

        await joinOrSkip(page);
        expect(await readActorSystem(page, actorId, 'wounds.max')).toBe(12);
        recordCoverage('origin.resources', 'wounds');
    });

    test("Rogue Trader Fortune's +1 Fate raises the Fate total and points, once", async ({ page }) => {
        const { actorId, sheetId } = await boot(page, 'Fortune Seeker', 'rt-character', { gameSystem: 'rt', fate: { max: 2, value: 2 } }, RT_FORTUNE);
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.max')).toBe(3);
        expect(await readActorSystem(page, actorId, 'fate.value')).toBe(3);

        await showSheetTab(page, actorId, 'overview');
        await expect(page.locator(`#${sheetId} ${VITALS} .wh40k-fate-pip`)).toHaveCount(3);
        await snapElement(page, 'origin-resources-fortune-seeker-after', `#${sheetId} ${VITALS}`, sheetId);

        await joinOrSkip(page);
        expect(await readActorSystem(page, actorId, 'fate.max')).toBe(3);
        recordCoverage('origin.resources', 'fate');
    });
});
