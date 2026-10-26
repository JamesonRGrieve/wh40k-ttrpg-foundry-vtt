import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#699 item 2): an item keeps its image through a sheet edit and a reload.
 *
 * Every item sheet's portrait carried `data-edit="img"` on its wrapper div, so the
 * sheet's form data sent the wrapper's `<img …>` markup as `img` on every save. The
 * document rejected it and, with no type in an update diff, stored the generic
 * placeholder: a gear item's sack became a hooded figure after any edit, and an
 * edited origin path lost its art. Each case here is edited through its sheet, then
 * the page reloads and the stored image must be the one it had at creation.
 */

const PREFIX = 'e2e-699-img';

interface Case {
    type: string;
    /** An image given at creation; omitted means the type's default. */
    img?: string;
    /** A field the sheet edits, and the value it is set to. */
    field: string;
    value: string;
}

/** The gear case, also captured after the reload. */
const GEAR_CASE: Case = { type: 'gear', field: 'system.quantity', value: '7' };
const CASES: readonly Case[] = [GEAR_CASE, { type: 'originPath', img: 'icons/svg/direction.svg', field: 'system.stepIndex', value: '2' }];

interface ProbeItem {
    name: string;
    img: string;
    _source: { img: string | null };
    sheet: { id: string; render: (o: { force: boolean }) => Promise<void>; close: () => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { getName: (name: string) => ProbeItem | undefined; filter: (fn: (i: { name: string }) => boolean) => ProbeItem[] } };
}

const nameOf = (c: Case): string => `${PREFIX} ${c.type}`;

/** The stored image of a probe item. */
async function storedImg(page: Page, c: Case): Promise<string | null | undefined> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        return (globalThis as unknown as ProbeWindow).game.items.getName(name)?._source.img;
    }, nameOf(c));
}

async function openSheet(page: Page, c: Case): Promise<string> {
    return page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.items.getName(name);
        if (item === undefined) throw new Error(`${name} missing`);
        await item.sheet.render({ force: true });
        return item.sheet.id;
    }, nameOf(c));
}

async function cleanup(page: Page): Promise<void> {
    await page.evaluate(async (prefix) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) await item.delete();
    }, PREFIX);
}

test('an item keeps its image through a sheet edit and a reload (#699)', async ({ page }) => {
    await joinOrSkip(page);
    await cleanup(page);
    await page.evaluate(
        async ({ cases, prefix }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const c of cases) await w.Item.create({ name: `${prefix} ${c.type}`, type: c.type, ...(c.img === undefined ? {} : { img: c.img }) });
        },
        { cases: [...CASES], prefix: PREFIX },
    );

    const created: Record<string, string | null | undefined> = {};
    for (const c of CASES) {
        // eslint-disable-next-line no-await-in-loop -- each item is read and edited in turn, like a GM would
        created[c.type] = await storedImg(page, c);
        expect(created[c.type], `${c.type} has an image at creation`).toMatch(/\.svg$/u);
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const editSheetId = await openSheet(page, c);
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await page.evaluate(
            ({ id, field, value }) => {
                const control = document.querySelector<HTMLInputElement>(`#${id} [name="${field}"]`);
                if (control === null) throw new Error(`${field} not rendered`);
                control.value = value;
                control.dispatchEvent(new Event('change', { bubbles: true }));
            },
            { id: editSheetId, field: c.field, value: c.value },
        );
        // The edit saved, and the image did not change with it.
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await expect.poll(async () => page.locator(`#${editSheetId} [name="${c.field}"]`).inputValue()).toBe(c.value);
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        expect(await storedImg(page, c), `${c.type} image after the sheet edit`).toBe(created[c.type]);
    }

    await page.reload();
    await joinOrSkip(page);
    for (const c of CASES) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        expect(await storedImg(page, c), `${c.type} image after the reload`).toBe(created[c.type]);
    }

    const sheetId = await openSheet(page, GEAR_CASE);
    await clearScreenOverlays(page, sheetId);
    await expect(page.locator(`#${sheetId} img[data-edit="img"]`)).toHaveAttribute('src', created[GEAR_CASE.type] ?? '');
    await snap(page, 'item-default-img-gear-after-edit-reload', { selector: `#${sheetId}` });
    await cleanup(page);
    recordCoverage('document.img', 'Item.image.persistsThroughSheetEdit');
});
