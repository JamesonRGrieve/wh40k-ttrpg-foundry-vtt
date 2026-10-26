import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B regression for #612: an edit made on an item sheet survives a reload.
 *
 * Item-sheet templates used to open their own form inside the sheet's root form
 * (every item sheet is `tag: 'form'`). The nested form owned the controls, so
 * the root form's submit-on-change sent nothing and every edit was silently
 * dropped. This edits one field on a world item of each template family through
 * its sheet, reloads the page, and checks the value persisted, with a capture of
 * one sheet per family before the edit and after the reload.
 *
 * The value is set on the control and a `change` dispatched, the event the
 * sheet's form listens for, because several fields sit on a non-default tab.
 */

const PREFIX = 'e2e-612';
const FREEFORM_SETTING = 'freeform-characters';

interface Case {
    /** Template family, for the screenshot label. */
    family: string;
    type: string;
    /** The form field edited, a `system.` path. */
    field: string;
    /** The value entered; read back as a string. */
    value: string;
    /** Extra item data so the field renders. */
    initial?: object;
    /** Snap this case's sheet before and after (one per family). */
    snapIt: boolean;
}

const CASES: readonly Case[] = [
    { family: 'generic', type: 'navigatorPower', field: 'system.mastery', value: 'adept', snapIt: true },
    { family: 'content-block', type: 'specialAbility', field: 'system.cost', value: '750', initial: { category: 'mark', cost: 400 }, snapIt: true },
    { family: 'gear', type: 'gear', field: 'system.quantity', value: '7', snapIt: true },
    { family: 'gear', type: 'ammunition', field: 'system.clipModifier', value: '3', snapIt: false },
    { family: 'gear', type: 'cybernetic', field: 'system.weight', value: '3', snapIt: false },
    { family: 'weapon-mod', type: 'weaponModification', field: 'system.craftsmanship', value: 'good', snapIt: true },
    { family: 'ship', type: 'shipWeapon', field: 'system.strength', value: '4', snapIt: true },
    { family: 'psychic-trait-skill', type: 'psychicPower', field: 'system.range', value: 'e2e Range', snapIt: false },
    { family: 'psychic-trait-skill', type: 'trait', field: 'system.level', value: '3', snapIt: true },
    { family: 'origin-journal-lead-location', type: 'location', field: 'system.sector', value: 'e2e Sector', snapIt: true },
];

interface ProbeItem {
    id: string;
    system: object;
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: {
        items: { getName: (name: string) => ProbeItem | undefined; filter: (fn: (i: { name: string }) => boolean) => ProbeItem[] };
        settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, value: boolean) => Promise<boolean> };
    };
    foundry: { utils: { getProperty: (obj: object, path: string) => string | number | null | undefined } };
}

const itemName = (c: Case): string => `${PREFIX} ${c.type}`;

/** Open the case's item sheet; returns its app id. */
async function openSheet(page: Page, c: Case): Promise<string> {
    const sheetId = await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.items.getName(name);
        if (item === undefined) throw new Error(`${name} missing`);
        await item.sheet.render({ force: true });
        return item.sheet.id;
    }, itemName(c));
    await expect(page.locator(`#${sheetId} [name="${c.field}"]`)).toHaveCount(1);
    return sheetId;
}

async function closeSheet(page: Page, c: Case): Promise<void> {
    await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        await (globalThis as unknown as ProbeWindow).game.items.getName(name)?.sheet.close();
    }, itemName(c));
}

async function storedValue(page: Page, c: Case): Promise<string> {
    return page.evaluate(
        ({ name, field }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = w.game.items.getName(name);
            return item === undefined ? '<missing>' : String(w.foundry.utils.getProperty(item, field) ?? '');
        },
        { name: itemName(c), field: c.field },
    );
}

async function snapSheet(page: Page, sheetId: string, label: string): Promise<void> {
    await clearScreenOverlays(page, sheetId);
    const shot = await snap(page, label, { selector: `#${sheetId}` });
    expect(shot, `snap ${label}`).not.toBeNull();
}

/** Run `step` over `items` strictly one after another. */
async function inSequence<T>(items: readonly T[], step: (item: T) => Promise<void>): Promise<void> {
    await items.reduce(async (previous, item) => {
        await previous;
        await step(item);
    }, Promise.resolve());
}

/** Edit the case's field through its sheet and wait for the save. */
async function editCase(page: Page, c: Case): Promise<void> {
    const sheetId = await openSheet(page, c);
    if (c.snapIt) await snapSheet(page, sheetId, `item-persist-${c.family}-before`);
    // A rejected submit only surfaces as a console error / notification: keep them for the failure message.
    const errors: string[] = [];
    const onConsole = (msg: { type: () => string; text: () => string }): void => {
        if (msg.type() === 'error') errors.push(msg.text());
    };
    page.on('console', onConsole);
    await page.evaluate(
        ({ id, field, value }) => {
            const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id} [name="${field}"]`);
            if (control === null) throw new Error(`${field} not rendered`);
            control.value = value;
            control.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { id: sheetId, field: c.field, value: c.value },
    );
    try {
        await expect.poll(async () => storedValue(page, c), { message: `${c.type} ${c.field} saved` }).toBe(c.value);
    } catch (err) {
        throw new Error(`${err instanceof Error ? err.message : String(err)}\nconsole errors: ${errors.join(' | ')}`);
    } finally {
        page.off('console', onConsole);
    }
    await closeSheet(page, c);
}

/** After the reload: the stored value survived, and the sheet shows it. */
async function verifyCase(page: Page, c: Case): Promise<void> {
    expect(await storedValue(page, c), `${c.type} ${c.field} after reload`).toBe(c.value);
    if (!c.snapIt) return;
    const sheetId = await openSheet(page, c);
    await expect(page.locator(`#${sheetId} [name="${c.field}"]`)).toHaveValue(c.value);
    // #699: the title shows whole; its font steps down instead of clipping mid-letter.
    const clipped = await page
        .locator(`#${sheetId} input[name="name"]`)
        .first()
        .evaluate((input) => input.scrollWidth > input.clientWidth + 1);
    expect(clipped, `${c.type} title clipped`).toBe(false);
    await snapSheet(page, sheetId, `item-persist-${c.family}-after-reload`);
    await closeSheet(page, c);
}

async function cleanup(page: Page): Promise<void> {
    await page.evaluate(
        async ({ prefix, setting }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) await item.delete();
            if (w.game.settings.get('wh40k-rpg', setting)) await w.game.settings.set('wh40k-rpg', setting, false);
        },
        { prefix: PREFIX, setting: FREEFORM_SETTING },
    );
}

test('item-sheet edits persist across a reload, for every template family (#612)', async ({ page }) => {
    await joinOrSkip(page);
    await cleanup(page);
    await page.evaluate(
        async ({ cases, prefix, setting }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            // The content-block sheets (special ability, mutation, …) are freeform-gated.
            await w.game.settings.set('wh40k-rpg', setting, true);
            await Promise.all(cases.map(async (c) => w.Item.create({ name: `${prefix} ${c.type}`, type: c.type, system: c.initial ?? {} })));
        },
        { cases: CASES, prefix: PREFIX, setting: FREEFORM_SETTING },
    );

    // The sheets are edited one at a time, like a GM would.
    await inSequence(CASES, async (c) => editCase(page, c));

    // Reload: the values must come back from the server, not from the client's memory.
    await page.reload();
    await joinOrSkip(page);
    await inSequence(CASES, async (c) => verifyCase(page, c));

    await cleanup(page);
    recordCoverage('sheet.edit', 'ItemSheets.persistAcrossReload');
});
