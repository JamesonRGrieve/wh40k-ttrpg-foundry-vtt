/**
 * Regression (#697): an item sheet that overrides `_onDrop` for its own drops
 * (nested items, references, weapon mods and ammo) passes every other drop on to
 * ItemSheetV2, which copies a dropped Active Effect onto the item. The container
 * sheet and the weapon sheet returned early on any drop that was not an Item, so an
 * Active Effect dropped on a weapon or armour sheet vanished.
 *
 * Source scan, like the other sheet-class guards: the sheets need a live Foundry
 * application API to instantiate. Tier B (container-item-drops.spec.ts) drops an
 * Active Effect on a weapon and an armour sheet and checks it lands.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ITEM_SHEETS = resolve(__dirname, '../src/module/applications/item');

/** The body of a class member method, from its signature to its closing brace (4-space member indent). */
function methodBody(src: string, name: string): string | null {
    const signature = new RegExp(`^ {4}(?:override\\s+)?(?:async\\s+)?${name}\\s*\\([^)]*\\)[^{]*\\{`, 'm').exec(src);
    if (signature === null) return null;
    const start = signature.index + signature[0].length;
    const end = src.indexOf('\n    }\n', start);
    return end === -1 ? null : src.slice(start, end);
}

/** Every item sheet source that overrides `_onDrop`, with that method's body. */
function dropOverrides(): Array<{ file: string; body: string }> {
    return readdirSync(ITEM_SHEETS)
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.stories.ts'))
        .flatMap((file) => {
            const body = methodBody(readFileSync(join(ITEM_SHEETS, file), 'utf8'), '_onDrop');
            return body === null ? [] : [{ file, body }];
        });
}

/** An early return on a non-Item drop that hands it to nothing. */
const SWALLOWS_NON_ITEM = /type\s*!==\s*'Item'\s*\)\s*(?:\{\s*)?return\s+false/u;
/** The drop is passed on: to ItemSheetV2 directly, or to the parent override that does. */
const PASSES_ON = /_onDropDefault\(|super\._onDrop\(/u;

describe('item sheet drop overrides pass other drops on (#697)', () => {
    const overrides = dropOverrides();

    it('finds the container, weapon and reference-list overrides', () => {
        expect(overrides.map((o) => o.file)).toEqual(expect.arrayContaining(['container-item-sheet.ts', 'weapon-sheet.ts', 'reference-list-item-sheet.ts']));
    });

    it('no override returns early on a drop that is not an Item', () => {
        expect(overrides.filter((o) => SWALLOWS_NON_ITEM.test(o.body)).map((o) => o.file)).toEqual([]);
    });

    it('every override passes the drops it does not handle on', () => {
        expect(overrides.filter((o) => !PASSES_ON.test(o.body)).map((o) => o.file)).toEqual([]);
    });

    it('the detector flags the old swallowing return', () => {
        expect(SWALLOWS_NON_ITEM.test("if (data.type !== 'Item') return false;")).toBe(true);
        expect(SWALLOWS_NON_ITEM.test("if (data.type !== 'Item') {\n            return false;")).toBe(true);
        expect(SWALLOWS_NON_ITEM.test("if (data.type !== 'Item') return super._onDrop(event);")).toBe(false);
    });
});
