import type { Locator, Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #656: an edit on each NPC Template tab saves. The sheet's inputs once
 * named paths the schema lacked (`scalingRules.*`, `weapons.*`, `equipment.*`,
 * `armourNotes`, `trainedSkills.N.bonus`), and Foundry's form parser drops such a
 * path, so those edits were silently lost. The tag and equipment controls had no
 * actions behind them at all.
 */

interface TemplateSystem {
    scaling: { woundsScale: number };
    tags: string[];
    trainedSkills: Array<{ bonus: number }>;
    customWeapons: Array<{ name: string }>;
    armourNotes: string;
    equipment: Array<{ name: string; quantity: number }>;
}

interface ItemGlobal {
    Item: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        items: {
            get: (
                id: string,
            ) => { system: TemplateSystem; sheet: { id: string; render: (o: object) => Promise<object> }; delete: () => Promise<object> } | undefined;
        };
    };
}

async function saved(page: Page, itemId: string): Promise<TemplateSystem | null> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const sys = (globalThis as unknown as ItemGlobal).game.items.get(id)?.system;
        return sys === undefined ? null : (JSON.parse(JSON.stringify(sys)) as TemplateSystem);
    }, itemId);
}

/** Type into an input and leave it, which submits the sheet. */
async function edit(field: Locator, value: string): Promise<void> {
    await field.fill(value);
    await field.press('Tab');
}

test.describe.serial('NPC Template sheet edits save (Tier B, #656)', () => {
    test('an edit on each tab reaches the item', async ({ page }) => {
        await joinOrSkip(page);
        const itemId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
            const doc = await (globalThis as unknown as ItemGlobal).Item.create({
                name: 'e2e-656 Edit Round Trip',
                type: 'npcTemplate',
                system: { equipmentPreset: 'custom' },
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

            // Basics: a scaling rule, and a tag added with Enter.
            await edit(sheet.locator('input[name="system.scaling.woundsScale"]'), '2.5');
            await expect.poll(async () => (await saved(page, itemId))?.scaling.woundsScale).toBe(2.5);
            const tagInput = sheet.locator('[data-wh40k-hook="npc-template-tag-input"]');
            await tagInput.fill('cultist');
            await tagInput.press('Enter');
            await expect.poll(async () => (await saved(page, itemId))?.tags).toEqual(['cultist']);
            await expect(sheet.locator('[data-action="removeTag"]')).toHaveCount(1);
            await snap(page, 'npc-template-basics-saved', { selector: `#${sheetId}` });

            // Characteristics: a trained skill's bonus.
            await sheet.locator('nav.tabs [data-tab="characteristics"]').click();
            await sheet.locator('[data-action="addSkill"]').click();
            await expect.poll(async () => (await saved(page, itemId))?.trainedSkills.length).toBe(1);
            await edit(sheet.locator('input[name="system.trainedSkills.0.bonus"]'), '5');
            await expect.poll(async () => (await saved(page, itemId))?.trainedSkills[0]?.bonus).toBe(5);
            const skillRow = sheet.locator('[data-tab="characteristics"] div[data-index="0"]');
            await skillRow.scrollIntoViewIfNeeded();
            await expect(skillRow).toContainText('Awareness');
            await expect(skillRow.locator('[data-field="skill-characteristic"]')).toHaveText('Per');
            expect(await scanContrast(page, `#${sheetId} [data-tab="characteristics"] :has(> div[data-index="0"])`)).toEqual([]);
            await snap(page, 'npc-template-characteristics-saved', { selector: `#${sheetId}` });

            // Equipment: a custom weapon, the armour notes, and a carried item.
            await sheet.locator('nav.tabs [data-tab="equipment"]').click();
            await sheet.locator('[data-action="addWeapon"]').click();
            await expect.poll(async () => (await saved(page, itemId))?.customWeapons.length).toBe(1);
            await edit(sheet.locator('input[name="system.customWeapons.0.name"]'), 'Autogun');
            await expect.poll(async () => (await saved(page, itemId))?.customWeapons[0]?.name).toBe('Autogun');
            await edit(sheet.locator('input[name="system.armourNotes"]'), 'Flak coat');
            await expect.poll(async () => (await saved(page, itemId))?.armourNotes).toBe('Flak coat');
            await sheet.locator('[data-action="addEquipment"]').click();
            await expect.poll(async () => (await saved(page, itemId))?.equipment.length).toBe(1);
            await edit(sheet.locator('input[name="system.equipment.0.quantity"]'), '2');
            await expect.poll(async () => (await saved(page, itemId))?.equipment[0]?.quantity).toBe(2);
            await snap(page, 'npc-template-equipment-saved', { selector: `#${sheetId}` });

            // The remove controls take the rows out again.
            await sheet.locator('[data-action="removeEquipment"]').click();
            await expect.poll(async () => (await saved(page, itemId))?.equipment.length).toBe(0);
            await sheet.locator('nav.tabs [data-tab="basics"]').click();
            await sheet.locator('[data-action="removeTag"]').click();
            await expect.poll(async () => (await saved(page, itemId))?.tags).toEqual([]);
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                await (globalThis as unknown as ItemGlobal).game.items.get(id)?.delete();
            }, itemId);
        }
    });
});
