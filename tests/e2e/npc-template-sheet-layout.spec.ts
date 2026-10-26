import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #656, on the live NPC Template item sheet at its default width:
 * - the tab row holds all five tabs (the fifth used to be cut off);
 * - the Base Characteristics subtitle sits below its heading (they collided);
 * - the Trained Skills "+" clears its heading (it was glued to it).
 * It also edits a base and an unnatural characteristic. Their inputs were named
 * by list index and a non-existent path. Separately, `system.baseArmour` was an
 * input on two tabs, which made every submit on the sheet fail validation, so no
 * edit saved at all.
 */

interface ItemGlobal {
    Item: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        items: {
            get: (id: string) =>
                | {
                      system: { baseCharacteristics: Record<string, number>; unnaturals: Record<string, number> };
                      sheet: { id: string; render: (o: object) => Promise<object> };
                      delete: () => Promise<object>;
                  }
                | undefined;
        };
    };
}

/** What the layout checks found, as human-readable problems. */
async function layoutProblems(page: Page, sheetId: string): Promise<string[]> {
    return page.evaluate((id) => {
        const root = document.getElementById(id);
        if (root === null) return ['sheet not found'];
        const problems: string[] = [];
        const nav = root.querySelector('nav.tabs');
        const box = nav?.getBoundingClientRect();
        for (const tab of Array.from(nav?.querySelectorAll('[data-tab]') ?? [])) {
            const r = tab.getBoundingClientRect();
            if (box === undefined || r.right > box.right + 0.5 || r.width === 0) problems.push(`tab ${tab.getAttribute('data-tab') ?? ''} cut off`);
        }
        // The characteristics note sits on its own line under the section's title bar (#656, #695).
        const note = root.querySelector('[data-field="base-characteristics-note"]');
        const titleBar = note?.closest('[data-item-section]')?.querySelector('header');
        if (note == null || titleBar == null) problems.push('note outside a titled section');
        else if (note.getBoundingClientRect().top < titleBar.getBoundingClientRect().bottom - 0.5) problems.push('note overlaps the heading');
        const add = root.querySelector('[data-action="addSkill"]');
        const addTitle = add?.parentElement?.querySelector('h3');
        if (add == null || addTitle == null) problems.push('add-skill or its heading missing');
        else {
            const range = document.createRange();
            range.selectNodeContents(addTitle);
            if (add.getBoundingClientRect().left - range.getBoundingClientRect().right < 8) problems.push('add-skill glued to its heading');
        }
        return problems;
    }, sheetId);
}

async function itemSystem(page: Page, itemId: string): Promise<{ ws: number; strengthUnnatural: number }> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const sys = (globalThis as unknown as ItemGlobal).game.items.get(id)?.system;
        return { ws: sys?.baseCharacteristics['weaponSkill'] ?? -1, strengthUnnatural: sys?.unnaturals['strength'] ?? 0 };
    }, itemId);
}

test.describe.serial('NPC Template sheet layout (Tier B, #656)', () => {
    test('at the default width the tabs fit, the headings have room, and the characteristic inputs save', async ({ page }) => {
        await joinOrSkip(page);
        const itemId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as ItemGlobal;
            const doc = await g.Item.create({ name: 'e2e-656 Hive Ganger', type: 'npcTemplate' });
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
            await sheet.locator('nav.tabs [data-tab="characteristics"]').click();
            await expect(sheet.locator('[data-field="base-characteristics-note"]')).toBeVisible();
            // #701: an NPC template edits an NPC's nine characteristics, never a PC's Influence.
            await expect(sheet.locator('input[name="system.baseCharacteristics.influence"]')).toHaveCount(0);
            await expect(sheet.locator('input[name="system.baseCharacteristics.fellowship"]')).toHaveCount(1);
            await snap(page, 'npc-template-characteristics-default-width', { selector: `#${sheetId}` });
            expect(await layoutProblems(page, sheetId)).toEqual([]);

            await sheet.locator('input[name="system.baseCharacteristics.weaponSkill"]').fill('41');
            await sheet.locator('input[name="system.baseCharacteristics.weaponSkill"]').press('Tab');
            await expect.poll(async () => (await itemSystem(page, itemId)).ws).toBe(41);
            await sheet.locator('input[name="system.unnaturals.strength"]').fill('2');
            await sheet.locator('input[name="system.unnaturals.strength"]').press('Tab');
            await expect.poll(async () => (await itemSystem(page, itemId)).strengthUnnatural).toBe(2);
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                await (globalThis as unknown as ItemGlobal).game.items.get(id)?.delete();
            }, itemId);
        }
    });
});
