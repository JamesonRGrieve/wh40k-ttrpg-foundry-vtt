import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #657: the Ship Weapon and Ship Component sheets' Hull Types field
 * was a multi-select about two lines tall that clipped its options. It is now a
 * checkbox per hull type (Foundry's <multi-checkbox>). On each live sheet every
 * hull type's checkbox shows in full, and ticking one saves it to
 * `system.hullType`.
 */

const FIELD = '[data-field="hull-types"] multi-checkbox';

interface ItemGlobal {
    Item: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        items: {
            get: (
                id: string,
            ) =>
                | { system: { hullType: Set<string> }; sheet: { id: string; render: (o: object) => Promise<object> }; delete: () => Promise<object> }
                | undefined;
        };
    };
}

/** Each checkbox's value, and whether its label is clipped by the field. */
async function readCheckboxes(page: Page, sheetId: string): Promise<{ values: string[]; clipped: string[]; fieldScrolls: boolean }> {
    return page.evaluate(
        ({ id, sel }) => {
            const field = document.querySelector<HTMLElement>(`#${id} ${sel}`);
            if (field === null) return { values: [], clipped: ['field missing'], fieldScrolls: false };
            const box = field.getBoundingClientRect();
            const labels = Array.from(field.querySelectorAll('label'));
            return {
                values: labels.map((label) => label.querySelector('input')?.value ?? ''),
                clipped: labels
                    .filter((label) => {
                        const r = label.getBoundingClientRect();
                        return r.height === 0 || r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5 || label.scrollWidth > label.clientWidth + 1;
                    })
                    .map((label) => label.textContent.trim()),
                fieldScrolls: field.scrollHeight > field.clientHeight + 1,
            };
        },
        { id: sheetId, sel: FIELD },
    );
}

async function hullTypes(page: Page, itemId: string): Promise<string[]> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const set = (globalThis as unknown as ItemGlobal).game.items.get(id)?.system.hullType;
        return set === undefined ? [] : [...set].sort();
    }, itemId);
}

for (const type of ['shipWeapon', 'shipComponent'] as const) {
    test(`${type}: every hull type is a full checkbox, and ticking one saves it`, async ({ page }) => {
        await joinOrSkip(page);
        const itemId = await page.evaluate(async (itemType) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
            const doc = await (globalThis as unknown as ItemGlobal).Item.create({
                name: `e2e-657 ${itemType}`,
                type: itemType,
                system: { hullType: ['transport'] },
            });
            return doc?.id ?? '';
        }, type);
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
            const field = page.locator(`#${sheetId} ${FIELD}`);
            await field.scrollIntoViewIfNeeded();
            await snap(page, `ship-hull-types-${type}`, { selector: `#${sheetId} [data-field="hull-types"]` });
            const read = await readCheckboxes(page, sheetId);
            expect(read.values).toEqual(['all', 'transport', 'raider', 'frigate', 'light-cruiser', 'cruiser', 'battlecruiser', 'grand-cruiser']);
            expect(read.clipped, 'no hull type label is clipped').toEqual([]);
            expect(read.fieldScrolls, 'the field shows every option without scrolling').toBe(false);
            await expect(field.locator('input[value="transport"]')).toBeChecked();

            await field.locator('input[value="frigate"]').check();
            await expect.poll(async () => hullTypes(page, itemId)).toEqual(['frigate', 'transport']);
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                await (globalThis as unknown as ItemGlobal).game.items.get(id)?.delete();
            }, itemId);
        }
    });
}
