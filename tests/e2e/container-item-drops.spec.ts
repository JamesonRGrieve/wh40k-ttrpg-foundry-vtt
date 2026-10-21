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
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => ProbeItem[]; getName: (name: string) => ProbeItem | undefined } };
}

/** Create a world item; open its sheet when `open` is set. Returns its uuid and, if opened, the sheet id. */
async function createItem(page: Page, data: { name: string; type: string; system?: object }, open: boolean): Promise<{ uuid: string; appId: string }> {
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
});
