import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { readSelectFit } from './select-fit';

/**
 * Tier B for #658, driven through the Compendium Browser's own controls:
 * - Grouped by Source (the default), every result sat under "Unknown Source".
 *   The browser read `system.source.book` off the index, but the packs store
 *   the source per game line (`{ rt: { book, … }, bc: {…} }`).
 * - None of the browser's controls were wired. The move to Tailwind dropped the
 *   classes its listeners looked for, so search, the filters and Group By did
 *   nothing.
 * - The subtitle named Rogue Trader in every line's world.
 * It types a search (which must keep focus across the re-render), picks a
 * source, and regroups by pack.
 */

const BROWSER_MODULE_URL = '/systems/wh40k-rpg/module/applications/compendium-browser.js';

interface BrowserState {
    subtitle: string;
    /** Results per group, by label. */
    counts: Record<string, number>;
    sources: string[];
    searchFocused: boolean;
}

async function openBrowser(page: Page): Promise<string | null> {
    return page.evaluate(async (url): Promise<string | null> => {
        interface BrowserInstance {
            id: string;
            element: HTMLElement | null;
            render: (o: { force: boolean }) => Promise<object>;
        }
        const mod = (await import(url)) as { RTCompendiumBrowser?: new (opts: object) => BrowserInstance };
        if (mod.RTCompendiumBrowser === undefined) return null;
        const browser = new mod.RTCompendiumBrowser({});
        await browser.render({ force: true });
        const ok = await globalThis.wh40kE2E.pollUntil(() => browser.element?.querySelector('[data-result-group]') != null);
        return ok ? browser.id : null;
    }, BROWSER_MODULE_URL);
}

async function readBrowser(page: Page, id: string): Promise<BrowserState> {
    return page.evaluate((appId): BrowserState => {
        const root = document.getElementById(appId);
        const groups = Array.from(root?.querySelectorAll<HTMLElement>('[data-result-group]') ?? []);
        return {
            subtitle: root?.querySelector('header p')?.textContent.trim() ?? '',
            counts: Object.fromEntries(groups.map((group) => [group.dataset['resultGroup'] ?? '', group.querySelectorAll('[data-uuid]').length])),
            sources: Array.from(root?.querySelectorAll<HTMLOptionElement>('#filter-source option') ?? [], (option) => option.value).filter(
                (value) => value !== 'all',
            ),
            searchFocused: document.activeElement?.getAttribute('data-wh40k-hook') === 'cb-search',
        };
    }, id);
}

async function closeBrowser(page: Page, id: string): Promise<void> {
    await page.evaluate(async (appId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } } };
        await g.foundry.applications.instances.get(appId)?.close();
    }, id);
}

test.describe.serial('Compendium Browser sources and controls (Tier B, #658)', () => {
    test('search, the Source filter and Group By work, and results group under their books', async ({ page }) => {
        await joinOrSkip(page);
        const id = await openBrowser(page);
        expect(id, 'the browser rendered').not.toBeNull();
        if (id === null) return;
        try {
            const browser = page.locator(`#${id}`);
            expect((await readBrowser(page, id)).subtitle).not.toContain('Rogue Trader');

            // Typing re-renders on each keystroke; the box keeps its focus and its text.
            await browser.locator('[data-wh40k-hook="cb-search"]').pressSequentially('Pistol');
            await expect(browser.locator('[data-wh40k-hook="cb-search"]')).toHaveValue('Pistol');
            const searched = await readBrowser(page, id);
            expect(searched.searchFocused, 'the search box keeps focus while typing').toBe(true);
            await snap(page, 'compendium-browser-grouped-by-source', { selector: `#${id}`, keepWindow: id });
            // Each row names its source book (the chip rendered the `sourceLabel` helper, i.e. nothing).
            await expect(browser.locator('[data-field="result-source"]').first()).not.toBeEmpty();
            // The filter selects show their whole value ("All Categories" was clipped).
            for (const hook of ['cb-filter-source', 'cb-filter-category', 'cb-group-by']) {
                const fit = await readSelectFit(page, `#${id} [data-wh40k-hook="${hook}"]`);
                expect(fit?.fits, `${hook}: line ${fit?.lineHeight ?? 0}px in a ${fit?.contentHeight ?? 0}px box`).toBe(true);
            }

            expect(Object.keys(searched.counts), 'results group under their books').toEqual(
                expect.arrayContaining(['RT: Core Rulebook', 'DH2: Core Rulebook', 'OW: Core Rulebook']),
            );
            // A few entries name no source and stay "Unknown Source"; it no longer holds everything.
            const total = Object.values(searched.counts).reduce((sum, n) => sum + n, 0);
            const unknown = searched.counts['Unknown Source'] ?? 0;
            expect(unknown, `${unknown} of ${total} results without a source`).toBeLessThan(total / 10);
            expect(searched.sources).toEqual(expect.arrayContaining(['RT: Core Rulebook', 'DH2: Core Rulebook']));

            const book = 'RT: Core Rulebook';
            await browser.locator('[data-wh40k-hook="cb-filter-source"]').selectOption(book);
            await expect.poll(async () => Object.keys((await readBrowser(page, id)).counts)).toEqual([book]);
            expect((await readBrowser(page, id)).counts[book]).toBe(searched.counts[book]);

            await browser.locator('[data-wh40k-hook="cb-group-by"]').selectOption('pack');
            await expect
                .poll(async () => Object.keys((await readBrowser(page, id)).counts).some((label) => label.includes('Rogue Trader') || label.startsWith('RT')))
                .toBe(true);
            await snap(page, 'compendium-browser-filtered-by-pack', { selector: `#${id}`, keepWindow: id });
        } finally {
            await closeBrowser(page, id);
        }
    });
});
