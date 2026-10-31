import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#702): an armour's Special Properties are added and removed through the
 * sheet. The sheet handed the template bare property ids where it reads
 * `{ id, label, description }`, so an added property showed as a blank chip whose
 * remove button named no property and removed nothing. Picking an option also
 * submitted the sheet, whose re-render cleared the choice before Add read it; the
 * ammunition sheet's quality boxes shared that path. Saving the sheet keeps the
 * item's image (the reset reported alongside it was #699).
 */

const NAME = 'e2e-702 item';
const IMG = 'icons/svg/shield.svg';

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeItem {
    img: string;
    sheet: ProbeApp;
    system: { properties?: Set<string>; addedQualities?: Set<string>; weight?: number };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => ProbeItem[] } };
}

/** The test item's stored properties (armour), added qualities (ammunition), image and weight. */
async function stored(page: Page): Promise<{ properties: string[]; addedQualities: string[]; img: string; weight: number }> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const item = w.game.items.filter((i) => i.name === name).at(0);
        return {
            properties: [...(item?.system.properties ?? [])],
            addedQualities: [...(item?.system.addedQualities ?? [])],
            img: item?.img ?? '',
            weight: item?.system.weight ?? 0,
        };
    }, NAME);
}

test.describe.serial('armour special properties (Tier B, #702)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name === name)) {
                await item.sheet.close();
                await item.delete();
            }
        }, NAME);
    });

    test('a property added from the sheet shows its label and description, and its chip removes it', async ({ page }) => {
        await joinOrSkip(page);
        const appId = await page.evaluate(
            async ({ name, img }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                const item = await w.Item.create({ name, img, type: 'armour', system: { coverage: ['all'], properties: [] } });
                if (item === null) throw new Error('Item.create returned null');
                await item.sheet.render({ force: true });
                return item.sheet.id;
            },
            { name: NAME, img: IMG },
        );
        const sheet = page.locator(`#${appId}`);
        await expect(sheet).toBeVisible();
        await clearScreenOverlays(page, appId);

        // Add two properties through the select and the Add button. Picking an option must
        // not submit (and re-render) the sheet, or the choice is gone before Add reads it.
        const picker = sheet.locator('select[data-sheet-local="new-property"]');
        for (const id of ['sealed', 'blessed']) {
            await picker.selectOption(id);
            await expect(picker).toHaveValue(id);
            await sheet.locator('[data-action="addProperty"]').click();
            await expect.poll(async () => (await stored(page)).properties).toContain(id);
        }

        const chips = sheet.locator('[data-action="removeProperty"]');
        await expect(chips).toHaveCount(2);
        await expect(chips.nth(0)).toHaveAttribute('data-property', 'sealed');
        await expect(chips.nth(0).locator('xpath=..')).toHaveText('Sealed');
        await expect(chips.nth(1).locator('xpath=..')).toHaveText('Blessed');
        // Each property's description is listed, and an added property leaves the select.
        await expect(sheet).toContainText('Provides complete environmental protection');
        await expect(picker.locator('option[value="sealed"]')).toHaveCount(0);
        expect(await sheet.locator('.window-content').innerText()).not.toContain('WH40K.');
        await snap(page, 'armour-special-properties-added', { selector: `#${appId}` });

        // The chip's remove button removes that property only.
        await chips.nth(0).click();
        await expect.poll(async () => (await stored(page)).properties).toEqual(['blessed']);
        await expect(sheet.locator('[data-action="removeProperty"]')).toHaveCount(1);
        await expect(picker.locator('option[value="sealed"]')).toHaveCount(1);

        // A field edit saves the sheet; the item's image is kept (#699).
        const weight = sheet.locator('input[name="system.weight"]');
        await weight.fill('12');
        await weight.press('Tab');
        await expect.poll(async () => (await stored(page)).weight).toBe(12);
        expect((await stored(page)).img).toBe(IMG);
        await snap(page, 'armour-special-properties-removed', { selector: `#${appId}` });

        recordCoverage('sheet.section', 'armour.special-properties');
    });

    test('an ammunition quality typed in its box is added by the Add button', async ({ page }) => {
        await joinOrSkip(page);
        const appId = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({ name, type: 'ammunition' });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        }, NAME);
        const sheet = page.locator(`#${appId}`);
        await expect(sheet).toBeVisible();
        await clearScreenOverlays(page, appId);

        // Typing then clicking Add blurs the box first; that change must not submit the
        // sheet and swallow the click.
        await sheet.locator('button[data-group="primary"][data-tab="qualities"]').click();
        await sheet.locator('input[data-sheet-local="new-added-quality"]').fill('Tearing');
        await sheet.locator('[data-action="addQuality"][data-type="added"]').click();
        await expect.poll(async () => (await stored(page)).addedQualities).toEqual(['Tearing']);
        await expect(sheet.locator('[data-action="removeAddedQuality"]')).toHaveAttribute('data-quality', 'Tearing');
        await expect(sheet.locator('input[data-sheet-local="new-added-quality"]')).toHaveValue('');
        await snap(page, 'ammo-added-quality-from-box', { selector: `#${appId}` });

        recordCoverage('sheet.section', 'ammo.added-qualities');
    });
});
