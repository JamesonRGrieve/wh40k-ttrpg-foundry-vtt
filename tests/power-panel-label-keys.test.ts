/**
 * The ritual-type and order-category labels resolve to langpack keys (#194).
 *
 * The rituals and ship-orders panels never showed until they moved to the Combat
 * tab, so their `WH40K.RitualType.*` / `WH40K.OrderCategory.*` keys were never
 * defined and the rows printed raw keys. This reads each schema's `choices` and
 * checks the key the label getter builds exists.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface LangPack {
    WH40K: Record<string, Record<string, string> | string>;
}

const ROOT = resolve(__dirname, '..');
const lang = JSON.parse(readFileSync(resolve(ROOT, 'src/lang/en.json'), 'utf8')) as LangPack;

/** The `choices` array of the schema field declared as `<field>: new fields.StringField({ … choices: [...] })`. */
function schemaChoices(file: string, field: string): string[] {
    const src = readFileSync(resolve(ROOT, file), 'utf8');
    const block = new RegExp(`${field}: new fields\\.StringField\\(\\{[^}]*?choices: \\[([^\\]]+)\\]`).exec(src);
    return [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => String(m[1]));
}

/** The langpack group's keys. */
function groupKeys(group: string): string[] {
    const entries = lang.WH40K[group];
    return typeof entries === 'object' ? Object.keys(entries) : [];
}

/** `tech-rite` → `TechRite`, as the ritual and order label getters build it. */
const pascal = (value: string): string =>
    value
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

describe('power-panel label keys', () => {
    it('defines a WH40K.RitualType key for every ritual type', () => {
        const types = schemaChoices('src/module/data/item/ritual.ts', 'type');
        expect(types.length).toBeGreaterThan(0);
        expect(types.map(pascal).filter((key) => !groupKeys('RitualType').includes(key))).toEqual([]);
    });

    it('defines a WH40K.OrderCategory key for every order category', () => {
        const categories = schemaChoices('src/module/data/item/order.ts', 'category');
        expect(categories.length).toBeGreaterThan(0);
        expect(categories.map(pascal).filter((key) => !groupKeys('OrderCategory').includes(key))).toEqual([]);
    });
});
