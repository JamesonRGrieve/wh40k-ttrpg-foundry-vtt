import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #659, on a live Psychic Power item sheet at its default width:
 * - the discipline showed its raw key ("pyromancy") in a free-text field; it is
 *   now a select over the disciplines with langpack labels;
 * - the header's stat block fell into the 80px image column, so "PYROMANCY
 *   POWER", the source and the range wrapped word by word; it spans the header;
 * - an unset XP cost was blank; it reads "—" and the field says "Not set"
 *   (per-power costs await content#30).
 * Picking a discipline in the select saves it.
 */

interface ItemGlobal {
    Item: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        items: {
            get: (
                id: string,
            ) => { system: { discipline: string }; sheet: { id: string; render: (o: object) => Promise<object> }; delete: () => Promise<object> } | undefined;
        };
    };
}

async function discipline(page: Page, itemId: string): Promise<string> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        return (globalThis as unknown as ItemGlobal).game.items.get(id)?.system.discipline ?? '';
    }, itemId);
}

test.describe.serial('Psychic power sheet (Tier B, #659)', () => {
    test('the discipline is a labelled select, the header spans the sheet, and an unset XP cost reads "—"', async ({ page }) => {
        await joinOrSkip(page);
        const itemId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
            const doc = await (globalThis as unknown as ItemGlobal).Item.create({
                name: 'e2e-659 Fire Barrage',
                type: 'psychicPower',
                system: { discipline: 'pyromancy', range: '15 metres x Psy Rating', source: { book: 'BC: Tome of Fate', page: '61' } },
            });
            return doc?.id ?? '';
        });
        expect(itemId).not.toBe('');
        try {
            const sheetId = await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const itemSheet = (globalThis as unknown as ItemGlobal).game.items.get(id)?.sheet;
                if (itemSheet === undefined) return '';
                await itemSheet.render({ force: true });
                return itemSheet.id;
            }, itemId);
            expect(sheetId).not.toBe('');
            const sheet = page.locator(`#${sheetId}`);
            await expect(sheet.locator('[data-field="discipline-label"]')).toHaveText('Pyromancy Power');
            await snap(page, 'psychic-power-sheet-header', { selector: `#${sheetId}` });

            const slotWidth = await sheet.locator('[data-field="item-header-slot"]').evaluate((el) => el.getBoundingClientRect().width);
            expect(slotWidth, 'the header block spans the sheet, not the 80px image column').toBeGreaterThan(300);
            const labelLines = await sheet
                .locator('[data-field="discipline-label"]')
                .evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
            expect(labelLines, '"Pyromancy Power" stays on one line').toBe(1);

            const select = sheet.locator('select[name="system.discipline"]');
            await expect(select).toHaveValue('pyromancy');
            await expect(select.locator('option:checked')).toHaveText('Pyromancy');
            await expect(sheet.locator('[data-field="xp-cost"]')).toHaveText('—');
            await expect(sheet.locator('input[name="system.cost"]')).toHaveAttribute('placeholder', 'Not set');

            await select.selectOption('telepathy');
            await expect.poll(async () => discipline(page, itemId)).toBe('telepathy');
            await expect(sheet.locator('[data-field="discipline-label"]')).toHaveText('Telepathy Power');
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                await (globalThis as unknown as ItemGlobal).game.items.get(id)?.delete();
            }, itemId);
        }
    });
});
