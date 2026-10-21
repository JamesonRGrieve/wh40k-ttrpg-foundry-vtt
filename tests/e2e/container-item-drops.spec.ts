import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#697): drops onto container item sheets.
 *
 * A storage location accepts a dropped gear item as a nested item: the sheet reads
 * the types it accepts from the DataModel class, where StorageLocationData declares
 * them. It read them off the instance and refused every drop.
 */

const PREFIX = 'e2e-697';

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeItem {
    uuid: string;
    name: string;
    sheet: ProbeApp;
    items: { size: number; contents: Array<{ name: string; type: string }> };
    effects: { contents: Array<{ name: string; uuid: string }> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => ProbeItem[]; getName: (name: string) => ProbeItem | undefined } };
}

/** Create a world item; open its sheet when `open` is set. Returns its uuid and, if opened, the sheet id. */
async function createItem(
    page: Page,
    data: { name: string; type: string; system?: object; effects?: object[] },
    open: boolean,
): Promise<{ uuid: string; appId: string }> {
    return page.evaluate(
        async ({ itemData, openSheet }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create(itemData);
            if (item === null) throw new Error('Item.create returned null');
            if (openSheet) await item.sheet.render({ force: true });
            return { uuid: item.uuid, appId: openSheet ? item.sheet.id : '' };
        },
        { itemData: data, openSheet: open },
    );
}

/** Drop drag data (`{type, uuid}`) onto an open sheet, as a drag from the sidebar or a compendium does. */
async function dropOnSheet(page: Page, appId: string, dragData: { type: string; uuid: string }, selector = 'form, .window-content'): Promise<void> {
    await page.evaluate(
        ({ id, payload, target }) => {
            const el = document.querySelector(`#${id}`)?.querySelector(target);
            if (el === null || el === undefined) throw new Error(`no drop target ${target} in #${id}`);
            const transfer = new DataTransfer();
            transfer.setData('text/plain', JSON.stringify(payload));
            el.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
        },
        { id: appId, payload: dragData, target: selector },
    );
}

/** The names of an item's nested items. */
async function nestedNames(page: Page, name: string): Promise<string[]> {
    return page.evaluate((itemName) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        return w.game.items.getName(itemName)?.items.contents.map((i) => i.name) ?? [];
    }, name);
}

/** The names of an item's Active Effects. */
async function effectNames(page: Page, name: string): Promise<string[]> {
    return page.evaluate((itemName) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        return w.game.items.getName(itemName)?.effects.contents.map((e) => e.name) ?? [];
    }, name);
}

/** The uuid of the first Active Effect on a world item. */
async function firstEffectUuid(page: Page, name: string): Promise<string> {
    return page.evaluate((itemName) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const effect = w.game.items.getName(itemName)?.effects.contents[0];
        if (effect === undefined) throw new Error(`${itemName} has no effect`);
        return effect.uuid;
    }, name);
}

/** An Active Effect a drop copies onto the target sheet's item. */
const EFFECT_NAME = `${PREFIX} steady aim`;

test.describe.serial('drops onto container item sheets (Tier B, #697)', () => {
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

    test('a storage location takes a dropped gear item as a nested item', async ({ page }) => {
        await joinOrSkip(page);
        const gear = await createItem(page, { name: `${PREFIX} rope`, type: 'gear' }, false);
        const store = await createItem(page, { name: `${PREFIX} footlocker`, type: 'storageLocation' }, true);
        const sheet = page.locator(`#${store.appId}`);
        await expect(sheet).toBeVisible();
        await clearScreenOverlays(page, store.appId);

        await dropOnSheet(page, store.appId, { type: 'Item', uuid: gear.uuid });
        await expect.poll(async () => nestedNames(page, `${PREFIX} footlocker`)).toEqual([`${PREFIX} rope`]);
        const row = sheet.locator('[data-nested-item-id]').filter({ hasText: `${PREFIX} rope` });
        await expect(row).toBeVisible();
        await snap(page, 'storage-location-dropped-item', { selector: `#${store.appId}` });

        // Its delete control removes it, after the confirmation.
        await row.locator('[data-action="nestedItemDelete"]').click();
        const confirm = page.locator('.confirmation-dialog').last();
        await expect(confirm).toBeVisible();
        await confirm.locator('[data-action="confirm"]').click();
        await expect.poll(async () => nestedNames(page, `${PREFIX} footlocker`)).toEqual([]);
        await expect(sheet.locator('[data-nested-item-id]')).toHaveCount(0);
        recordCoverage('sheet.drop', 'storageLocation.nested-item');
    });

    // A container sheet passes a drop that is not an Item to ItemSheetV2's own
    // handler, which copies a dropped Active Effect onto the item. The container's
    // drop handling used to swallow it.
    for (const type of ['weapon', 'armour'] as const) {
        test(`an Active Effect dropped on a ${type} sheet lands on the ${type}`, async ({ page }) => {
            await joinOrSkip(page);
            await createItem(page, { name: `${PREFIX} effect source`, type: 'gear', effects: [{ name: EFFECT_NAME }] }, false);
            const effectUuid = await firstEffectUuid(page, `${PREFIX} effect source`);
            const target = await createItem(page, { name: `${PREFIX} ${type}`, type }, true);
            const sheet = page.locator(`#${target.appId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, target.appId);

            await dropOnSheet(page, target.appId, { type: 'ActiveEffect', uuid: effectUuid });
            await expect.poll(async () => effectNames(page, `${PREFIX} ${type}`)).toEqual([EFFECT_NAME]);

            // The armour sheet lists it on its Effects tab.
            if (type === 'armour') {
                await sheet.locator('nav [data-tab="effects"]').first().click();
                await expect(sheet.locator('div[data-tab="effects"], section[data-tab="effects"]').getByText(EFFECT_NAME)).toBeVisible();
                await snap(page, 'armour-sheet-dropped-active-effect', { selector: `#${target.appId}` });
            }
            recordCoverage('sheet.drop', `${type}.active-effect`);
        });
    }
});
