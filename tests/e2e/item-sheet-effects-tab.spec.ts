import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: item-sheet tabs open, the Effects tab included (#638).
 *
 * The shared item tab strip's `<nav>` had neither `tabs` (Foundry's changeTab
 * selector) nor `wh40k-tabs` (the selector BaseItemSheet binds clicks through), so
 * clicking a tab did nothing and `changeTab('effects', 'primary')` threw "No
 * matching tab element". The NPC-template and Endeavour sheets' tabs were broken
 * the same way. Each case clicks a tab the way a player does and checks the panel
 * shows, the sheet keeps its size, and `changeTab` works programmatically too.
 */

const PREFIX = 'e2e-638';

interface Case {
    type: string;
    /** The tab clicked. */
    tab: string;
    /** A selector inside the tab's panel that must become visible. */
    content: string;
    snapIt: boolean;
}

const CASES: readonly Case[] = [
    { type: 'gear', tab: 'effects', content: '[data-action="effectCreate"], [data-action="createEffect"], .tab[data-tab="effects"] header', snapIt: true },
    { type: 'navigatorPower', tab: 'effects', content: '.tab[data-tab="effects"] header', snapIt: true },
    {
        type: 'npcTemplate',
        tab: 'characteristics',
        content: 'section.tab[data-tab="characteristics"] select, section.tab[data-tab="characteristics"] input',
        snapIt: true,
    },
    { type: 'endeavour', tab: 'objectives', content: 'section.tab[data-tab="objectives"]', snapIt: false },
];

interface ProbeApp {
    id: string;
    tabGroups: Record<string, string>;
    changeTab: (tab: string, group: string) => void;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<{ sheet: ProbeApp } | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ sheet: ProbeApp; delete: () => Promise<void> }> } };
    foundry: { applications: { instances: Map<string, ProbeApp> } };
}

async function openSheet(page: Page, type: string): Promise<string> {
    return page.evaluate(
        async ({ itemType, name }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({ name, type: itemType });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        },
        { itemType: type, name: `${PREFIX} ${type}` },
    );
}

async function activeTab(page: Page, appId: string): Promise<string> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
    return page.evaluate((id) => (globalThis as unknown as ProbeWindow).foundry.applications.instances.get(id)?.tabGroups['primary'] ?? '', appId);
}

test.describe.serial('item-sheet tabs open (Tier B, #638)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) {
                await item.sheet.close();
                await item.delete();
            }
        }, PREFIX);
    });

    for (const c of CASES) {
        test(`${c.type}: clicking the ${c.tab} tab opens it`, async ({ page }) => {
            await joinOrSkip(page);
            const appId = await openSheet(page, c.type);
            const sheet = page.locator(`#${appId}`);
            const before = await sheet.boundingBox();
            const button = sheet.locator(`nav.tabs [data-tab="${c.tab}"]`);
            await expect(button).toHaveCount(1);
            // Tab labels are localized, never a raw langpack key.
            await expect(sheet.locator('nav.tabs')).not.toContainText('WH40K.');
            await clearScreenOverlays(page, appId);
            await button.click();
            await expect.poll(async () => activeTab(page, appId)).toBe(c.tab);
            await expect(sheet.locator(`.tab[data-tab="${c.tab}"]`)).toHaveClass(/(^|\s)active(\s|$)/);
            await expect(sheet.locator(c.content).first()).toBeVisible();
            // The window keeps its size and place (it used to collapse to a bare header).
            const after = await sheet.boundingBox();
            expect(after?.width).toBe(before?.width);
            expect(after?.height).toBe(before?.height);
            if (c.snapIt) await snap(page, `item-sheet-${c.type}-${c.tab}-tab`, { selector: `#${appId}` });

            // And programmatically, through Foundry's own changeTab.
            const thrown = await page.evaluate((id) => {
                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                    const app = (globalThis as unknown as ProbeWindow).foundry.applications.instances.get(id);
                    const first = document.querySelector<HTMLElement>(`#${id} nav.tabs [data-tab]`)?.dataset['tab'] ?? '';
                    app?.changeTab(first, 'primary');
                    return '';
                } catch (err) {
                    return String(err);
                }
            }, appId);
            expect(thrown).toBe('');
            recordCoverage('sheet.tab', `${c.type}.${c.tab}`);
        });
    }
});
