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
import {
    isJsonArray,
    isJsonObject,
    type Json,
    type JsonObject,
    migrateArmour,
    migrateArmourPoints,
    migrateCharacteristics,
    migrateMove,
    migrateSkills,
    parseSkillEntries,
    migrateWeapons,
    toInt,
} from './npc-import-migration.ts';

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

    it('remaps the Imperium Maledictum Str/Tgh/Wil abbreviations to the shared full-name keys', () => {
        // IM (Cubicle 7) abbreviates Strength/Toughness/Willpower as Str/Tgh/Wil
        // rather than the FFG S/T/WP; they must map to the same schema keys or
        // IM statblock Strength/Toughness/Willpower silently default to 30.
        const source: JsonObject = {
            characteristics: { ws: 50, bs: 30, str: 30, tgh: 30, ag: 30, int: 30, per: 30, wil: 25, fel: 25 },
        };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({
            weaponSkill: { base: 50, total: 50, bonus: 5, advancement: false },
            ballisticSkill: { base: 30, total: 30, bonus: 3, advancement: false },
            strength: { base: 30, total: 30, bonus: 3, advancement: false },
            toughness: { base: 30, total: 30, bonus: 3, advancement: false },
            agility: { base: 30, total: 30, bonus: 3, advancement: false },
            intelligence: { base: 30, total: 30, bonus: 3, advancement: false },
            perception: { base: 30, total: 30, bonus: 3, advancement: false },
            willpower: { base: 25, total: 25, bonus: 2, advancement: false },
            fellowship: { base: 25, total: 25, bonus: 2, advancement: false },
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

    it('keeps a PARTIAL structured object (update diff) verbatim — never resets base to 30', () => {
        // `_migrateData` runs on `actor.update('…characteristics.weaponSkill.base')`
        // diffs, where the value is a partial object lacking `total`. It must NOT be
        // mis-read as a legacy scalar (which previously reset every char to 30 on edit).
        const source: JsonObject = { characteristics: { weaponSkill: { base: 32 } } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({ weaponSkill: { base: 32 } });
    });

    it('remaps the key but keeps the value for a partial abbreviated-key object diff', () => {
        const source: JsonObject = { characteristics: { ws: { base: 32 } } };
        migrateCharacteristics(source);
        expect(source['characteristics']).toEqual({ weaponSkill: { base: 32 } });
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

    // #497 — the format 1558 of 1666 authored actors actually use. The parser
    // previously required the colon-prefixed line form (0 actors use it) and
    // silently produced nothing, so every NPC's known-skill list was empty.
    describe('the authored comma-list format (#497)', () => {
        it('parses a plain comma list with parenthesised characteristics', () => {
            const source: JsonObject = { skills: 'Athletics (S), Awareness (Per), Dodge (Ag), Intimidate (S), Security (Int)' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(Object.keys(ts).sort()).toEqual(['athletics', 'awareness', 'dodge', 'intimidate', 'security'].sort());
            // The characteristic parenthetical is consumed, not left in the name.
            expect(ts['awareness']).toMatchObject({ name: 'Awareness', characteristic: 'perception', trained: true });
            expect(ts['dodge']).toMatchObject({ name: 'Dodge', characteristic: 'agility' });
        });

        it('keeps a specialisation parenthetical in the name and still resolves the characteristic', () => {
            const source: JsonObject = { skills: 'Common Lore (Adeptus Arbites), Forbidden Lore (Daemonology)' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(ts['commonLore']).toMatchObject({ name: 'Common Lore (Adeptus Arbites)' });
            // Not named in the string, so it comes from the canonical catalogue.
            expect((ts['commonLore'] as JsonObject | undefined)?.['characteristic']).not.toBe('');
        });

        it('parses advances off the comma-list form', () => {
            const source: JsonObject = { skills: 'Awareness (Per) +10, Stealth (Ag) +20, Dodge (Ag)' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(ts['awareness']).toMatchObject({ plus10: true, plus20: false });
            expect(ts['stealth']).toMatchObject({ plus10: true, plus20: true });
            expect(ts['dodge']).toMatchObject({ plus10: false });
        });

        it('does not fragment a specialisation containing a comma', () => {
            const source: JsonObject = { skills: 'Common Lore (Imperium, Adeptus Arbites), Dodge (Ag)' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(Object.keys(ts).sort()).toEqual(['commonLore', 'dodge'].sort());
            expect(ts['commonLore']).toMatchObject({ name: 'Common Lore (Imperium, Adeptus Arbites)' });
        });

        it('keeps skills listed BEFORE a colon that came from a garbled skill name', () => {
            // 108 actors carry a stray colon like this. The old parser treated
            // everything before it as a characteristic prefix and discarded it, so
            // Charm and Deceive vanished entirely.
            const source: JsonObject = { skills: 'Charm (Fel), Deceive (Fel) +10, Forbidden: Lore (Daemonology), Stealth (Ag)' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(ts['charm']).toBeDefined();
            expect(ts['deceive']).toMatchObject({ plus10: true });
            expect(ts['stealth']).toBeDefined();
        });

        it('handles a specialisation AND a characteristic paren on the same skill', () => {
            // Verbatim from the corpus (furimancer, ardentii-proselytiser): the
            // trailing paren is the characteristic, the earlier one the
            // specialisation — and the specialisation itself contains a comma.
            const source: JsonObject = {
                skills: 'Acrobatics (Ag), Command (Fel) +10, Forbidden Lore (Psyker, Warp) (Int), Intimidate (S) +20',
            };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(Object.keys(ts).sort()).toEqual(['acrobatics', 'command', 'forbiddenLore', 'intimidate'].sort());
            expect(ts['forbiddenLore']).toMatchObject({
                name: 'Forbidden Lore (Psyker, Warp)',
                characteristic: 'intelligence',
                trained: true,
            });
            expect(ts['command']).toMatchObject({ characteristic: 'fellowship', plus10: true });
            expect(ts['intimidate']).toMatchObject({ characteristic: 'strength', plus20: true });
        });

        it('still honours the legacy line form when the prefix IS a characteristic', () => {
            const source: JsonObject = { skills: 'Ag: Dodge, Stealth' };
            migrateSkills(source);
            const ts = source['trainedSkills'] as JsonObject;
            expect(ts['dodge']).toMatchObject({ characteristic: 'agility' });
            expect(ts['stealth']).toMatchObject({ characteristic: 'agility' });
        });
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

describe('migrateArmour (IM flat scalar)', () => {
    it('wraps an Imperium Maledictum flat armour number into { mode: simple, total }', () => {
        const source: JsonObject = { armour: 2 };
        migrateArmour(source);
        expect(source['armour']).toEqual({ mode: 'simple', total: 2 });
    });

    it('floors a fractional value and clamps negatives to 0', () => {
        const a: JsonObject = { armour: 3.7 };
        migrateArmour(a);
        expect(asObject(a['armour'], 'armour')['total']).toBe(3);
        const b: JsonObject = { armour: -1 };
        migrateArmour(b);
        expect(asObject(b['armour'], 'armour')['total']).toBe(0);
    });

    it('leaves an already-structured armour object untouched (FFG NPCs)', () => {
        const source: JsonObject = {
            armour: { mode: 'locations', total: 4, locations: { head: 4, body: 4, leftArm: 4, rightArm: 4, leftLeg: 4, rightLeg: 4 } },
        };
        migrateArmour(source);
        expect(asObject(source['armour'], 'armour')['mode']).toBe('locations');
        expect(asObject(source['armour'], 'armour')['total']).toBe(4);
    });

    it('is a no-op when armour is absent', () => {
        const source: JsonObject = {};
        migrateArmour(source);
        expect(source['armour']).toBeUndefined();
    });
});

describe('migrateArmourPoints', () => {
    it('maps the flat "H# AR# AL# B# LR# LL#" string onto armour.locations', () => {
        const source: JsonObject = { armourPoints: 'H5 AR8 AL8 B10 LR7 LL7' };
        migrateArmourPoints(source);
        expect(source['armourPoints']).toBeUndefined();
        const armour = asObject(source['armour'], 'armour');
        expect(armour['mode']).toBe('locations');
        expect(armour['total']).toBe(10); // body
        const loc = asObject(armour['locations'], 'locations');
        expect(loc).toEqual({ head: 5, body: 10, leftArm: 8, rightArm: 8, leftLeg: 7, rightLeg: 7 });
    });

    it('maps left/right arm and leg to the correct DH2 hit-location slots', () => {
        // Asymmetric values prove AR→rightArm, AL→leftArm, LR→rightLeg, LL→leftLeg.
        const source: JsonObject = { armourPoints: 'H1 AR2 AL3 B4 LR5 LL6' };
        migrateArmourPoints(source);
        const loc = asObject(asObject(source['armour'], 'armour')['locations'], 'locations');
        expect(loc).toEqual({ head: 1, rightArm: 2, leftArm: 3, body: 4, rightLeg: 5, leftLeg: 6 });
    });

    it('is idempotent and leaves authored armour objects untouched', () => {
        const already: JsonObject = {
            armour: { mode: 'locations', total: 4, locations: { head: 4, body: 4, leftArm: 4, rightArm: 4, leftLeg: 4, rightLeg: 4 } },
        };
        migrateArmourPoints(already);
        expect(asObject(already['armour'], 'armour')['total']).toBe(4); // no armourPoints → no-op
    });

    it('drops an unparseable armourPoints string without inventing armour', () => {
        const source: JsonObject = { armourPoints: 'None' };
        migrateArmourPoints(source);
        expect(source['armourPoints']).toBeUndefined();
        expect(source['armour']).toBeUndefined();
    });
});

describe('migrateMove', () => {
    it('maps "half/full/charge/run" onto movement and flags it manual', () => {
        const source: JsonObject = { move: '3/6/9/18' };
        migrateMove(source);
        expect(source['move']).toBeUndefined();
        expect(source['movement']).toEqual({ half: 3, full: 6, charge: 9, run: 18 });
        expect(source['movementManual']).toBe(true);
    });

    it('preserves a printed move that deviates from the Agility-bonus formula', () => {
        const source: JsonObject = { move: '9/27/27/54' };
        migrateMove(source);
        expect(source['movement']).toEqual({ half: 9, full: 27, charge: 27, run: 54 });
        expect(source['movementManual']).toBe(true);
    });

    it('ignores a malformed move string', () => {
        const source: JsonObject = { move: '3/6' };
        migrateMove(source);
        expect(source['move']).toBeUndefined();
        expect(source['movement']).toBeUndefined();
        expect(source['movementManual']).toBeUndefined();
    });
});

/**
 * Structural hardening (#503). Each case below is a verbatim `skills` string from a
 * real pack actor that previously minted a garbage key — a key matching no catalogue
 * skill, which resolves to no characteristic and renders nowhere. Typos in skill
 * NAMES are deliberately not handled here: those are content defects fixed in the
 * pack JSON and the corpus, not in the parser (Direction #7).
 */
describe('migrateSkills structural hardening (#503)', () => {
    const parse = (skills: string): JsonObject => {
        const source: JsonObject = { skills };
        migrateSkills(source);
        return (source['trainedSkills'] ?? {}) as JsonObject;
    };

    it('splits pipe-joined characteristic groups, not just newlines', () => {
        // hb-rt-actors-npcs "Warlord Grashmekx the Blue" — previously produced the
        // keys `athletics+10|T:|Ag:Operate|Wp:Interrogation` and `|T:|Ag:Dodge`.
        const ts = parse('S: Intimidate +50, Athletics +10 | T: | Ag: Operate(Ground, Flyer) | WP: Interrogation');
        expect(Object.keys(ts).sort()).toEqual(['athletics', 'interrogation', 'intimidate', 'operate']);
        expect((ts['intimidate'] as JsonObject)['characteristic']).toBe('strength');
        expect((ts['interrogation'] as JsonObject)['characteristic']).toBe('willpower');
        expect((ts['operate'] as JsonObject)['characteristic']).toBe('agility');
    });

    it('drops sentence-ending punctuation instead of baking it into the key', () => {
        // hb-dh2-actors-bestiary "PDF Riot Officer" / "Genestealer Patriarch (Young)".
        const ts = parse('Awareness (Per), Intimidate (S), Inquiry (Fel), Scrutiny (Per).');
        expect(Object.keys(ts)).toContain('scrutiny');
        expect(Object.keys(ts).some((k) => k.includes('.'))).toBe(false);
    });

    it('peels every trailing modifier group, keeping the highest advance', () => {
        // dh2-beyond-actors-npcs "The Lord of Wrath" — previously `athletics+30`.
        const ts = parse('Athletics (S) +30 (Ag) +20, Awareness (Per)');
        expect(Object.keys(ts).sort()).toEqual(['athletics', 'awareness']);
        const athletics = ts['athletics'] as JsonObject;
        expect(athletics['advance']).toBe(4);
        expect(athletics['plus30']).toBe(true);
    });

    it('keeps a real specialisation in the name while peeling the characteristic', () => {
        const ts = parse('Common Lore (Underworld) (Int) +20, Operate (Surface) (Ag)');
        expect((ts['commonLore'] as JsonObject)['name']).toBe('Common Lore (Underworld)');
        expect((ts['commonLore'] as JsonObject)['characteristic']).toBe('intelligence');
        expect((ts['operate'] as JsonObject)['name']).toBe('Operate (Surface)');
        expect((ts['operate'] as JsonObject)['characteristic']).toBe('agility');
    });

    it('writes the advance rank alongside cumulative flags', () => {
        const ts = parse('Dodge (Ag), Stealth (Ag) +10, Awareness (Per) +20, Parry (WS) +30');
        const rank = (key: string): Json => (ts[key] as JsonObject)['advance'];
        expect([rank('dodge'), rank('stealth'), rank('awareness'), rank('parry')]).toEqual([1, 2, 3, 4]);
        // +20 must set BOTH plus10 and plus20 — getSkillTarget adds them cumulatively.
        const awareness = ts['awareness'] as JsonObject;
        expect(awareness['plus10']).toBe(true);
        expect(awareness['plus20']).toBe(true);
        expect(awareness['plus30']).toBe(false);
    });
});

describe('parseSkillEntries overflow (#503)', () => {
    it('carries an advance printed above the +30 ceiling as a flat bonus', () => {
        // hb-rt-actors-npcs "Warlord Grashmekx the Blue" prints Intimidate +50.
        // Truncating to rank 4 (+30) would silently drop 20 points.
        const entries = parseSkillEntries('S: Intimidate +50');
        expect(entries).toHaveLength(1);
        expect(entries[0]?.advance).toBe(4);
        expect(entries[0]?.bonus).toBe(20);
    });

    it('leaves bonus at 0 for every in-ladder advance', () => {
        for (const [prose, advance] of [
            ['Dodge (Ag)', 1],
            ['Dodge (Ag) +10', 2],
            ['Dodge (Ag) +20', 3],
            ['Dodge (Ag) +30', 4],
        ] as const) {
            const entries = parseSkillEntries(prose);
            expect(entries).toHaveLength(1);
            expect(entries[0]?.advance).toBe(advance);
            expect(entries[0]?.bonus).toBe(0);
        }
    });
});
