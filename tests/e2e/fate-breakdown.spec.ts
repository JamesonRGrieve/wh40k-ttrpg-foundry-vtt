import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
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
 * named after it. Built without writing the Fate total by hand (#691), the
 * base is the character's starting Fate: 2 + Fortune 1 + Fated 1 = 4.
 */

const RT_FORTUNE = compendiumUuid({ line: 'rt', category: 'origins-motivations' }, 'Sw4y6TekvknMmLBo');
const RT_FATED_FOR_GREATNESS = compendiumUuid({ line: 'rt', category: 'talents' }, 'CB00000000000003');
const STARTING_FATE = 2;
const FATE_TOTAL = 4;

interface ProbeItem {
    type: string;
    applyOriginToActor: (actor: object, options: { silent: boolean }) => Promise<void>;
}

interface ProbeActor {
    system: { fate: { max: number; value: number } };
    flags: { 'wh40k-rpg'?: { itemResourceDeltas?: object } };
    items: { find: (fn: (item: ProbeItem) => boolean) => ProbeItem | undefined };
    unsetFlag: (scope: string, key: string) => Promise<object | undefined>;
    sheet: { id: string };
}

interface ProbeWindow {
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
}

/** The actor's stored Fate total and current points. */
async function fateOf(page: Page, actorId: string): Promise<{ max: number; value: number }> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
        if (actor === undefined) throw new Error(`actor ${id} missing`);
        return { max: actor.system.fate.max, value: actor.system.fate.value };
    }, actorId);
}

/** Whether the actor carries an item resource ledger. */
async function hasLedger(page: Page, actorId: string): Promise<boolean> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
        if (actor === undefined) throw new Error(`actor ${id} missing`);
        return actor.flags['wh40k-rpg']?.itemResourceDeltas !== undefined;
    }, actorId);
}

/**
 * The Rogue Trader character the specs share. It starts with 2 Fate, and
 * nothing sets the total after that (#691): the talent's point is applied by
 * the item resource ledger when it is added, and the origin's by the origin
 * applier the world-ready reconcile runs.
 */
async function buildFatedExplorer(page: Page): Promise<{ actorId: string; sheetId: string }> {
    const ids = await openProbeSheet(page, {
        name: 'Fated Explorer',
        type: 'rt-character',
        system: { gameSystem: 'rt', fate: { max: STARTING_FATE, value: STARTING_FATE } },
    });
    await addCompendiumItems(page, ids.actorId, [RT_FORTUNE, RT_FATED_FOR_GREATNESS]);
    await expect.poll(async () => fateOf(page, ids.actorId)).toEqual({ max: STARTING_FATE + 1, value: STARTING_FATE + 1 });
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
        if (actor === undefined) throw new Error(`actor ${id} missing`);
        const origin = actor.items.find((item) => item.type === 'originPath');
        if (origin === undefined) throw new Error('Fortune missing');
        await origin.applyOriginToActor(actor, { silent: true });
    }, ids.actorId);
    await expect.poll(async () => fateOf(page, ids.actorId)).toEqual({ max: FATE_TOTAL, value: FATE_TOTAL });
    return ids;
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
        const { actorId, sheetId } = await buildFatedExplorer(page);
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

        // Every sidebar origin field keeps room for its text: in the narrow
        // sidebar it wraps under its label instead of clipping ("Home Wor").
        const fieldWidths = await page
            .locator(`#${sheetId} [data-sidebar-field] input[type="text"]`)
            .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
        expect(fieldWidths.length).toBeGreaterThan(0);
        for (const width of fieldWidths) expect(width).toBeGreaterThanOrEqual(112);

        await clearScreenOverlays(page, sheetId);
        await label.hover();
        const tooltip = page.locator('#tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Fortune');
        await expect(tooltip).toContainText('Fated for Greatness');
        await snap(page, 'fate-breakdown-origin', { selector: `#${sheetId}`, keepTooltip: true });
        recordCoverage('sheet.render', 'actor.fateBreakdown');
    });

    test('a character with no item ledger keeps its totals when the world reloads (seeded, never applied)', async ({ page }) => {
        const { actorId } = await buildFatedExplorer(page);
        // A character from before the ledger: its Fate already counts the talent.
        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            await actor.unsetFlag('wh40k-rpg', 'itemResourceDeltas');
        }, actorId);
        expect(await hasLedger(page, actorId), 'ledger deleted').toBe(false);

        // Reload: the world-ready pass seeds the ledger and leaves Fate alone.
        await page.reload();
        await joinOrSkip(page);
        await expect.poll(async () => hasLedger(page, actorId), { message: 'ledger seeded on load' }).toBe(true);
        expect(await fateOf(page, actorId)).toEqual({ max: FATE_TOTAL, value: FATE_TOTAL });

        await showSheetTab(page, actorId, 'overview');
        const sheetId = await page.evaluate((id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            return actor.sheet.id;
        }, actorId);
        await expect(page.locator(`#${sheetId} section.tab[data-tab="overview"] [data-stat-breakdown]`)).toHaveAttribute(
            'data-wh40k-tooltip-data',
            /"Base","value":2/,
        );
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'fate-ledger-seeded-after-reload', { selector: `#${sheetId}` });
        recordCoverage('sheet.render', 'actor.itemResourceLedgerSeed');
    });
});
