/**
 * Regression guard (#184): every langpack key the ship-weapon surfaces name must
 * resolve to a string. The ship-weapon item sheet labelled its fields with
 * `WH40K.ShipWeapon.Type`, `WH40K.ShipLocation` and `WH40K.HullType` — all three
 * are objects in en.json, so `localize` returned the raw key and the sheet showed
 * it. `ShipWeaponData.weaponTypeLabel` likewise built `WH40K.ShipWeapon.<Type>`,
 * which does not exist (the labels live under `.Type.`).
 *
 * A source scan, because the item sheet and DataModel cannot be constructed under
 * happy-dom: every literal `WH40K.*` key in the ship templates and modules must
 * be a string leaf, and the weapon-type label key must exist for every type.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

type LangNode = string | { [key: string]: LangNode };
const LANG = JSON.parse(readFileSync(resolve(ROOT, 'src/lang/en.json'), 'utf8')) as LangNode;

function leaf(key: string): LangNode | undefined {
    let node: LangNode | undefined = LANG;
    for (const part of key.split('.')) {
        node = typeof node === 'object' ? node[part] : undefined;
    }
    return node;
}

const SURFACES = [
    'src/templates/item/ship-weapon-sheet.hbs',
    'src/templates/item/ship-component-sheet.hbs',
    'src/templates/chat/ship-weapon-chat.hbs',
    'src/templates/chat/ship-critical-hit-chat.hbs',
    'src/templates/actor/voidcraft/tab-stats.hbs',
    'src/templates/actor/voidcraft/tab-extended-actions.hbs',
    'src/templates/actor/voidcraft/tab-manoeuvre-actions.hbs',
    'src/module/applications/item/ship-weapon-sheet.ts',
    'src/module/applications/ship-assault/ship-weapon-fire-flow.ts',
    'src/module/rules/ship-weapon-fire.ts',
    'src/module/data/item/ship-weapon.ts',
    'src/module/documents/voidcraft.ts',
];

/** Literal keys only: a key followed by `.${` is a prefix the code completes at runtime. */
function literalKeys(src: string): string[] {
    return Array.from(src.matchAll(/WH40K(?:\.[A-Za-z0-9]+)+(?!\.\$\{|[A-Za-z0-9.])/gu), (match) => match[0]);
}

describe('ship-weapon langpack keys (#184)', () => {
    it.each(SURFACES)('%s names only string langpack keys', (path) => {
        const src = readFileSync(resolve(ROOT, path), 'utf8');
        const unresolved = [...new Set(literalKeys(src))].filter((key) => typeof leaf(key) !== 'string');
        expect(unresolved).toEqual([]);
    });

    it('has a type label for every ship weapon type, under the key weaponTypeLabel builds', () => {
        const model = readFileSync(resolve(ROOT, 'src/module/data/item/ship-weapon.ts'), 'utf8');
        expect(model).toContain('`WH40K.ShipWeapon.Type.${this.weaponType');
        const choices = /weaponType: new fields\.StringField\(\{[^}]*choices: \[([^\]]*)\]/u.exec(model)?.[1] ?? '';
        const types = Array.from(choices.matchAll(/'([a-z-]+)'/gu), (match) => match[1]);
        expect(types.length).toBeGreaterThan(0);
        const pascal = (type: string): string =>
            type
                .split('-')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join('');
        expect(types.filter((type) => typeof leaf(`WH40K.ShipWeapon.Type.${pascal(type)}`) !== 'string')).toEqual([]);
    });
});
