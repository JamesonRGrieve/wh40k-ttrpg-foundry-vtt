import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #655: on the Trait item sheet the active tab label ("Properties")
 * was purple on a purple wash, and the header's Level value was dim purple on the
 * dark sheet. Both use the themed trait accent now. The live sheet's tab strip and
 * header are scanned for WCAG AA text contrast.
 */

interface SheetGlobal {
    Item: { create: (data: object) => Promise<{ id: string } | null> };
    game: { items: { get: (id: string) => { sheet: { id: string; render: (o: object) => Promise<object> }; delete: () => Promise<object> } | undefined } };
}

async function createTrait(page: Page): Promise<string> {
    return page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as SheetGlobal;
        const doc = await g.Item.create({ name: 'e2e-655 Sturdy', type: 'trait', system: { level: 3, gameSystems: ['dh2'] } });
        return doc?.id ?? '';
    });
}

async function openSheet(page: Page, itemId: string): Promise<string> {
    return page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as SheetGlobal;
        const sheet = g.game.items.get(id)?.sheet;
        if (sheet === undefined) return '';
        await sheet.render({ force: true });
        return sheet.id;
    }, itemId);
}

test.describe.serial('Trait item sheet contrast (Tier B, #655)', () => {
    test('the active tab label and the Level value are readable on the live sheet', async ({ page }) => {
        await joinOrSkip(page);
        const itemId = await createTrait(page);
        expect(itemId).not.toBe('');
        try {
            const sheetId = await openSheet(page, itemId);
            expect(sheetId).not.toBe('');
            const sheet = page.locator(`#${sheetId}`);
            await expect(sheet.locator('.wh40k-tab.active')).toContainText('Properties');
            await expect(sheet.locator('[data-field="trait-level"]')).toHaveText('3');
            await snap(page, 'trait-sheet-active-tab', { selector: `#${sheetId}` });
            expect(await scanContrast(page, `#${sheetId} nav.tabs`)).toEqual([]);
            // The scan reads the root's descendants: scan the Level value's own container.
            expect(await scanContrast(page, `#${sheetId} :has(> [data-field="trait-level"])`)).toEqual([]);
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as SheetGlobal;
                await g.game.items.get(id)?.delete();
            }, itemId);
        }
    });
});
