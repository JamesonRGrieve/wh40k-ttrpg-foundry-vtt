import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, showSheetTab } from './occult-sheet-flow';

/**
 * Tier B for #689: the Fate total's breakdown can be opened, and names each source.
 *
 * The breakdown existed but no sheet could open it, and it lumped every item's
 * Fate under "Talents & Traits", an origin's included. A Rogue Trader character
 * with the Fortune motivation (+1 Fate) and Fated for Greatness (+1 Fate) shows
 * the breakdown when the Fate label is hovered: the base, then one row per source
 * named after it.
 */

const RT_FORTUNE = 'Compendium.wh40k-rpg.rt-core-origins-motivations.Item.Sw4y6TekvknMmLBo';
const RT_FATED_FOR_GREATNESS = 'Compendium.wh40k-rpg.rt-core-items-talents.Item.CB00000000000003';
const FATE_TOTAL = 4;

interface ProbeWindow {
    game: { actors: { get: (id: string) => { update: (data: object) => Promise<object | undefined> } | undefined } };
}

interface BreakdownTooltip {
    title: string;
    sources: Array<{ name: string; value: number }>;
}

test.describe.serial('Fate breakdown (Tier B, #689)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('hovering Fate shows each source by name, the origin included', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, { name: 'Fated Explorer', type: 'rt-character', system: { gameSystem: 'rt' } });
        await addCompendiumItems(page, actorId, [RT_FORTUNE, RT_FATED_FOR_GREATNESS]);
        await page.evaluate(
            async ({ id, total }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
                if (actor === undefined) throw new Error(`actor ${id} missing`);
                await actor.update({ 'system.fate.max': total, 'system.fate.value': total });
            },
            { id: actorId, total: FATE_TOTAL },
        );
        await showSheetTab(page, actorId, 'overview');

        // The vitals panel also sits in the Combat tab's station panel; this is the Overview's.
        const label = page.locator(`#${sheetId} section.tab[data-tab="overview"] [data-stat-breakdown]`);
        await expect(label).toBeVisible();
        await expect(label).toHaveAttribute('data-wh40k-tooltip', 'modifier');
        const data = JSON.parse((await label.getAttribute('data-wh40k-tooltip-data')) ?? '{}') as BreakdownTooltip;
        expect(data.title).toContain(String(FATE_TOTAL));
        expect(data.sources).toEqual([
            { name: 'Base', value: 2 },
            { name: 'Fortune', value: 1 },
            { name: 'Fated for Greatness (Chosen by Destiny)', value: 1 },
        ]);

        await clearScreenOverlays(page, sheetId);
        await label.hover();
        const tooltip = page.locator('#tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Fortune');
        await expect(tooltip).toContainText('Fated for Greatness');
        await snap(page, 'fate-breakdown-origin', { selector: `#${sheetId}`, keepTooltip: true });
        recordCoverage('sheet.render', 'actor.fateBreakdown');
    });
});
