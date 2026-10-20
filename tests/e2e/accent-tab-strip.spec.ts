import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #690: the accent tab strip's tabs switch on the live origin-path, trait
 * and talent sheets.
 *
 * The origin and trait templates had no `.wh40k-tab-content` container for the
 * sheet's tab machinery to bind, and the origin panels hard-coded `tw-hidden`. So a
 * click on Description did nothing, and the origin's description, GM notes and
 * Source were out of reach. Each case clicks every tab the way a player does and
 * checks its panel is the one shown. The origin case then captures its Description tab.
 */

const PREFIX = 'e2e-690';

interface Case {
    type: string;
    tabs: readonly string[];
    /** Item system data at creation. */
    data: object;
}

const CASES: readonly Case[] = [
    {
        type: 'originPath',
        tabs: ['grants', 'requirements', 'choices', 'description'],
        data: { gameSystem: 'dh2', step: 'homeWorld', stepIndex: 1, source: { book: 'Dark Heresy 2e Core', page: '36' }, notes: 'Kept by the Ordo clerk.' },
    },
    { type: 'trait', tabs: ['properties', 'effects', 'description'], data: {} },
    { type: 'talent', tabs: [], data: {} },
];

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<{ sheet: ProbeApp } | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ sheet: ProbeApp; delete: () => Promise<void> }> } };
}

async function openSheet(page: Page, c: Case): Promise<string> {
    return page.evaluate(
        async ({ type, name, system }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({ name, type, system });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        },
        { type: c.type, name: `${PREFIX} ${c.type}`, system: c.data },
    );
}

test.describe.serial('accent tab strip switches tabs (Tier B, #690)', () => {
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
        test(`${c.type}: each tab opens its own panel`, async ({ page }) => {
            await joinOrSkip(page);
            const appId = await openSheet(page, c);
            const sheet = page.locator(`#${appId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, appId);
            const buttons = sheet.locator('nav.wh40k-tabs [data-tab]');
            const tabs = c.tabs.length > 0 ? [...c.tabs] : await buttons.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['tab'] ?? ''));
            expect(tabs.length).toBeGreaterThan(1);
            for (const tab of tabs) {
                await sheet.locator(`nav.wh40k-tabs [data-tab="${tab}"]`).click();
                await expect(sheet.locator(`.wh40k-tab-content > [data-tab="${tab}"]`)).toBeVisible();
                const shown = await sheet
                    .locator('.wh40k-tab-content > [data-tab]')
                    .evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => (el as HTMLElement).dataset['tab']));
                expect(shown, `after clicking ${tab}`).toEqual([tab]);
                const lit = await buttons.evaluateAll((els) =>
                    els
                        .filter((el) => el.classList.contains('active'))
                        .map((el) => [(el as HTMLElement).dataset['tab'], getComputedStyle(el).borderBottomColor]),
                );
                expect(
                    lit.map(([litTab]) => litTab),
                    `buttons lit after clicking ${tab}`,
                ).toEqual([tab]);
                // The accent underline follows `.active`, so the other buttons drop it (once
                // Foundry's button colour transition settles).
                await expect
                    .poll(
                        async () =>
                            buttons.evaluateAll((els) =>
                                els.filter((el) => !el.classList.contains('active')).map((el) => getComputedStyle(el).borderBottomColor),
                            ),
                        { message: `unlit underlines after clicking ${tab}` },
                    )
                    .toEqual(Array(tabs.length - 1).fill('rgba(0, 0, 0, 0)'));
            }
            if (c.type === 'originPath') {
                await sheet.locator('nav.wh40k-tabs [data-tab="description"]').click();
                await expect(sheet.locator('.wh40k-tab-content > [data-tab="description"] input[name="system.source.book"]')).toHaveValue(
                    'Dark Heresy 2e Core',
                );
                await snap(page, 'origin-sheet-description-tab', { selector: `#${appId}` });
            }
            recordCoverage('sheet.tab', `${c.type}.accent-strip`);
        });
    }
});
