import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { packHoldingId } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: a weapon modification's weight, edited on its sheet, is stored (#641).
 *
 * Every weapon-mod sheet edit used to store nothing, so a weight typed in stayed
 * 0: the sheet nested a form in its form root (#612, 2b7a67013) and, once that was
 * gone, its availability / craftsmanship selects submitted labels that failed
 * validation and dropped the whole submit (605a934fc). This edits the weight on
 * a compendium modification owned by a character (the line-variant, hydrated
 * path) and on a world copy, and checks each value survives a page reload.
 */

const PREFIX = 'e2e-641';
/** The DH2 weapon-mod pack holding Truesilver Gilding. */
const PACK = `wh40k-rpg.${packHoldingId({ line: 'dh2', category: 'weapon-mods' }, 'EB2TrSlvGld00001')}`;

interface ProbeItem {
    id: string;
    uuid: string;
    system: { weight: number };
    sheet: { id: string; render: (o: { force: boolean }) => Promise<void>; close: () => Promise<void> };
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<{ createEmbeddedDocuments: (t: string, d: object[]) => Promise<ProbeItem[]> } | null> };
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: {
        packs: {
            get: (
                id: string,
            ) =>
                | { getIndex: () => Promise<{ contents: Array<{ _id: string }> }>; getDocument: (id: string) => Promise<{ toObject: () => object }> }
                | undefined;
        };
        actors: { filter: (fn: (a: { name: string }) => boolean) => Array<{ delete: () => Promise<void> }> };
        items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ delete: () => Promise<void> }> };
    };
    fromUuid: (uuid: string) => Promise<ProbeItem | null>;
}

/** Create the owned and the world modification; returns their uuids. */
async function createMods(page: Page): Promise<{ owned: string; world: string }> {
    return page.evaluate(
        async ({ prefix, packId }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const pack = w.game.packs.get(packId);
            if (pack === undefined) throw new Error(`${packId} missing`);
            const [entry] = (await pack.getIndex()).contents;
            const source = (await pack.getDocument(entry._id)).toObject();
            const actor = await w.Actor.create({ name: `${prefix} Armourer`, type: 'dh2-character', system: { gameSystem: 'dh2' } });
            if (actor === null) throw new Error('Actor.create returned null');
            const [owned] = await actor.createEmbeddedDocuments('Item', [source]);
            const world = await w.Item.create({ ...source, name: `${prefix} World Mod` });
            if (world === null) throw new Error('world modification not created');
            return { owned: owned.uuid, world: world.uuid };
        },
        { prefix: PREFIX, packId: PACK },
    );
}

/** Type a weight into the item's sheet the way a player does; returns the sheet id. */
async function editWeight(page: Page, uuid: string, value: string): Promise<string> {
    const sheetId = await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = await (globalThis as unknown as ProbeWindow).fromUuid(id);
        if (item === null) throw new Error(`${id} missing`);
        await item.sheet.render({ force: true });
        return item.sheet.id;
    }, uuid);
    const input = page.locator(`#${sheetId} input[name="system.weight"]`);
    await expect(input).toHaveCount(1);
    await input.fill(value);
    await input.press('Tab');
    return sheetId;
}

async function storedWeight(page: Page, uuid: string): Promise<number | null> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
    return page.evaluate(async (id) => (await (globalThis as unknown as ProbeWindow).fromUuid(id))?.system.weight ?? null, uuid);
}

test.describe.serial('weapon-mod weight is stored (Tier B, #641)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const actor of w.game.actors.filter((a) => a.name.startsWith(prefix))) await actor.delete();
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) await item.delete();
        }, PREFIX);
    });

    test('an owned and a world modification keep the weight typed on their sheet across a reload', async ({ page }) => {
        await joinOrSkip(page);
        const mods = await createMods(page);

        const ownedSheet = await editWeight(page, mods.owned, '2.5');
        await expect.poll(async () => storedWeight(page, mods.owned)).toBe(2.5);
        await clearScreenOverlays(page, ownedSheet);
        await snap(page, 'weapon-mod-weight-owned-edited', { selector: `#${ownedSheet}` });

        await editWeight(page, mods.world, '1.5');
        await expect.poll(async () => storedWeight(page, mods.world)).toBe(1.5);

        await page.reload();
        await joinOrSkip(page);
        expect(await storedWeight(page, mods.owned)).toBe(2.5);
        expect(await storedWeight(page, mods.world)).toBe(1.5);
        const reopened = await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const item = await (globalThis as unknown as ProbeWindow).fromUuid(id);
            await item?.sheet.render({ force: true });
            return item?.sheet.id ?? '';
        }, mods.owned);
        await expect(page.locator(`#${reopened} input[name="system.weight"]`)).toHaveValue('2.5');
        await clearScreenOverlays(page, reopened);
        await snap(page, 'weapon-mod-weight-owned-after-reload', { selector: `#${reopened}` });
        recordCoverage('sheet.edit', 'WeaponModSheet.weight');
    });
});
