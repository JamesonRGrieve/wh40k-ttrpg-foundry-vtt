/**
 * Real (non-vacuous) regression tests for the NPC import/migration helpers (#242).
 *
 * These live against the pure `npc-import-migration` module rather than `NPCData`
 * because `npc.ts` destructures `foundry.data.fields` at module scope and cannot
 * import under happy-dom — the older `npc.test.ts` cases dynamic-import `./npc`
 * and early-return when that throws, so they assert nothing. The logic is the
 * same; here it is exercised directly, including a sweep over the real shipped
 * bestiary pack data that triggered the bug.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isJsonArray, isJsonObject, type Json, type JsonObject, migrateCharacteristics, migrateSkills, migrateWeapons, toInt } from './npc-import-migration.ts';

/** Narrow a JSON-parse result (the one true boundary) to an object, throwing on mismatch. */
// eslint-disable-next-line no-restricted-syntax -- boundary: argument is the raw JSON.parse() result before any validation
function asObject(value: unknown, label: string): JsonObject {
    if (!isJsonObject(value as Json)) throw new Error(`expected ${label} to be an object`);
    return value as JsonObject;
}

/** Narrow a JSON value to an array, throwing on mismatch — keeps test bodies conditional-free. */
function asArray(value: Json, label: string): Json[] {
    if (!isJsonArray(value)) throw new Error(`expected ${label} to be an array`);
    return value;
}

describe('toInt', () => {
    it('coerces numeric strings, flooring', () => {
        expect(toInt('42')).toBe(42);
        expect(toInt('3.9')).toBe(3);
        expect(toInt(9.9)).toBe(9);
    });

    it('uses the fallback for null/undefined/empty/non-numeric', () => {
        expect(toInt(null, 7)).toBe(7);
        expect(toInt(undefined, 7)).toBe(7);
        expect(toInt('', 7)).toBe(7);
        expect(toInt('not-a-number', 7)).toBe(7);
        expect(toInt(null)).toBe(0);
    });
});

describe('migrateCharacteristics', () => {
    it('remaps abbreviated scalar characteristics into the structured full-name shape', () => {
        const source: JsonObject = {
            characteristics: { ws: '45', bs: '30', s: '55', t: '45', ag: '35', int: '25', per: '35', wp: '40', fel: '20' },
        };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({
            weaponSkill: { base: 45, total: 45, bonus: 4, advancement: false },
            ballisticSkill: { base: 30, total: 30, bonus: 3, advancement: false },
            strength: { base: 55, total: 55, bonus: 5, advancement: false },
            toughness: { base: 45, total: 45, bonus: 4, advancement: false },
            agility: { base: 35, total: 35, bonus: 3, advancement: false },
            intelligence: { base: 25, total: 25, bonus: 2, advancement: false },
            perception: { base: 35, total: 35, bonus: 3, advancement: false },
            willpower: { base: 40, total: 40, bonus: 4, advancement: false },
            fellowship: { base: 20, total: 20, bonus: 2, advancement: false },
        });
    });

    it('wraps a full-name scalar characteristic (no key remap needed)', () => {
        const source: JsonObject = { characteristics: { weaponSkill: '45' } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({ weaponSkill: { base: 45, total: 45, bonus: 4, advancement: false } });
    });

    it('falls back to 30 for a missing/blank characteristic value', () => {
        const source: JsonObject = { characteristics: { ws: '' } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({ weaponSkill: { base: 30, total: 30, bonus: 3, advancement: false } });
    });

    it('leaves already-structured full-name characteristics untouched (idempotent)', () => {
        const structured = { weaponSkill: { base: 50, total: 50, bonus: 5, advancement: false } };
        const source: JsonObject = { characteristics: { ...structured } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual(structured);
    });

    it('is a no-op when characteristics is absent', () => {
        const source: JsonObject = { wounds: { max: 10 } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toBeUndefined();
    });
});

describe('migrateWeapons', () => {
    it('converts a legacy weapons[] array into the simple-mode object (melee inferred from "-")', () => {
        const source: JsonObject = {
            weapons: [{ name: 'Hellblade', range: '-', rof: '-', damage: '1d10+7 E', pen: '6', clip: '-', reload: '-', qualities: 'Daemon Weapon, Tearing' }],
        };
        migrateWeapons(source);
        expect(source['weapons']).toEqual({
            mode: 'simple',
            simple: [
                {
                    name: 'Hellblade',
                    damage: '1d10+7 E',
                    pen: 6,
                    range: '-',
                    rof: '-',
                    clip: 0,
                    reload: '-',
                    special: 'Daemon Weapon, Tearing',
                    class: 'melee',
                },
            ],
        });
    });

    it('infers a ranged weapon class from a non-melee range and defaults missing fields', () => {
        const source: JsonObject = { weapons: [{ name: 'Bolt Pistol', range: '30m', damage: '1d10+5 X', pen: '4' }] };
        migrateWeapons(source);
        expect(source['weapons']).toEqual({
            mode: 'simple',
            simple: [{ name: 'Bolt Pistol', damage: '1d10+5 X', pen: 4, range: '30m', rof: 'S/-/-', clip: 0, reload: '-', special: '', class: 'basic' }],
        });
    });

    it('drops non-weapon rows: tools with no damage and the Gear/Talents catch-all rows (#254)', () => {
        const source: JsonObject = {
            weapons: [
                { name: 'Combat Shotgun', range: '30m', damage: '1d10+4 I', pen: '0', qualities: 'Scatter' },
                { name: 'Shock Maul', range: '-', damage: '1d10+3 E', pen: '0', qualities: 'Shocking' },
                { name: 'Data-slate', range: '-', damage: null, qualities: 'Tool (not a weapon)' },
                { name: 'Gear/\nOther', range: 'robes, chrono', damage: null },
                { name: 'Talents/\nTraits', range: 'Total Recall', damage: null },
            ],
        };
        migrateWeapons(source);
        const result = source['weapons'] as { mode: string; simple: { name: string }[] };
        expect(result.mode).toBe('simple');
        // Only the two real weapons survive; tools + Gear/Talents rows are dropped.
        expect(result.simple.map((w) => w.name)).toEqual(['Combat Shotgun', 'Shock Maul']);
    });

    it('is a no-op when weapons is already an object', () => {
        const already = { mode: 'simple', simple: [] };
        const source: JsonObject = { weapons: already };
        migrateWeapons(source);
        expect(source['weapons']).toBe(already);
    });
});

describe('migrateSkills (#256)', () => {
    it('parses a raw skills stat-block string into structured trainedSkills', () => {
        const source: JsonObject = {
            skills: 'S: Intimidate\nT:\nAg: Dodge\nInt: Common Lore (Adeptus Arbites), Inquiry, Scrutiny\nPer: Awareness +10\nWP:\nFel: Charm',
        };
        migrateSkills(source);
        const ts = source['trainedSkills'] as JsonObject;
        // Camel-cased keys, no content table.
        expect(Object.keys(ts).sort()).toEqual(['awareness', 'charm', 'commonLore', 'dodge', 'inquiry', 'intimidate', 'scrutiny'].sort());
        expect(ts['dodge']).toMatchObject({ name: 'Dodge', characteristic: 'agility', trained: true, plus10: false });
        // Advance parsed off the name; characteristic resolved from the line abbrev.
        expect(ts['awareness']).toMatchObject({ name: 'Awareness', characteristic: 'perception', trained: true, plus10: true });
        // Specialisation kept in the display name, dropped from the key.
        expect(ts['commonLore']).toMatchObject({ name: 'Common Lore (Adeptus Arbites)', characteristic: 'intelligence', trained: true });
        // Empty characteristic lines (T:/WP:) contribute nothing.
        expect(ts['toughness']).toBeUndefined();
    });

    it('camel-cases multi-word and hyphenated skill names', () => {
        const source: JsonObject = { skills: 'Ag: Sleight of Hand\nInt: Tech-Use +20' };
        migrateSkills(source);
        const ts = source['trainedSkills'] as JsonObject;
        expect(Object.keys(ts).sort()).toEqual(['sleightOfHand', 'techUse'].sort());
        expect(ts['techUse']).toMatchObject({ name: 'Tech-Use', plus20: true });
    });

    it('does not clobber an already-populated trainedSkills', () => {
        const existing = { dodge: { trained: true } };
        const source: JsonObject = { skills: 'Ag: Awareness', trainedSkills: existing };
        migrateSkills(source);
        expect(source['trainedSkills']).toBe(existing);
    });

    it('is a no-op when the skills string is absent or blank', () => {
        const a: JsonObject = {};
        migrateSkills(a);
        expect(a['trainedSkills']).toBeUndefined();
        const b: JsonObject = { skills: '   ' };
        migrateSkills(b);
        expect(b['trainedSkills']).toBeUndefined();
    });
});

describe('real bestiary pack data migrates to a usable shape', () => {
    const PACK_DIR = resolve(__dirname, '../../../packs/dark-heresy-2/dh2-core-actors-bestiary/_source');
    const files = existsSync(PACK_DIR) ? readdirSync(PACK_DIR).filter((f) => f.endsWith('.json')) : [];
    // Whole-file reference stubs carry no system; relinked actors are canonically
    // weapons.mode 'embedded' (UUID-linked items; simple[] keeps any original
    // no-catalog-match rows verbatim) and pass through migration untouched. Only a
    // legacy weapons[] ARRAY migrates to the simple-mode object — partition the
    // cohorts up front so each test body is conditional-free.
    const sourced = files.filter((f) => {
        const parsed = JSON.parse(readFileSync(resolve(PACK_DIR, f), 'utf8')) as Json;
        return isJsonObject(parsed) && parsed['system'] !== undefined;
    });
    const legacy = sourced.filter((f) => {
        const parsed = JSON.parse(readFileSync(resolve(PACK_DIR, f), 'utf8')) as Json;
        return isJsonObject(parsed) && isJsonObject(parsed['system']) && isJsonArray(parsed['system']['weapons']);
    });

    it('finds the shipped bestiary pack', () => {
        // src/packs is a submodule; if it is unpopulated this guard is meaningless.
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(sourced)('migrates %s to numeric characteristics + a weapons object', (file) => {
        const parsed = asObject(JSON.parse(readFileSync(resolve(PACK_DIR, file), 'utf8')), file);
        const system = asObject(parsed['system'], `${file}.system`);

        migrateCharacteristics(system);
        migrateWeapons(system);

        const chars = asObject(system['characteristics'], `${file}.characteristics`);
        for (const [key, val] of Object.entries(chars)) {
            const c = asObject(val, `${file}.${key}`);
            expect(typeof c['total'], `${file}.${key}.total is numeric`).toBe('number');
            expect(typeof c['base'], `${file}.${key}.base is numeric`).toBe('number');
            expect(Number.isNaN(Number(c['total'])), `${file}.${key}.total not NaN`).toBe(false);
        }

        const weapons = asObject(system['weapons'], `${file}.weapons`);
        expect(['simple', 'embedded'], `${file} weapons.mode`).toContain(weapons['mode']);
    });

    // an empty .each table throws at collection — register the legacy suite only
    // when the pack still ships legacy-array actors (conditional registration at
    // describe scope, not inside a test body).
    if (legacy.length > 0) {
        it.each(legacy)('migrates the legacy weapons[] of %s to numeric simple rows', (file) => {
            const parsed = asObject(JSON.parse(readFileSync(resolve(PACK_DIR, file), 'utf8')), file);
            const system = asObject(parsed['system'], `${file}.system`);

            migrateWeapons(system);

            const weapons = asObject(system['weapons'], `${file}.weapons`);
            expect(weapons['mode'], `${file} weapons.mode`).toBe('simple');
            for (const w of asArray(weapons['simple'], `${file}.weapons.simple`)) {
                const wr = asObject(w, `${file} weapon`);
                expect(typeof wr['pen'], `${file} weapon.pen`).toBe('number');
                expect(typeof wr['clip'], `${file} weapon.clip`).toBe('number');
                expect(typeof wr['damage'], `${file} weapon.damage`).toBe('string');
            }
        });
    }
});
