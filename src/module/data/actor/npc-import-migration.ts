/**
 * Pure, Foundry-free NPC import/migration helpers (#242).
 *
 * Extracted from `npc.ts` so the legacy-compendium coercion logic is genuinely
 * unit-testable. `npc.ts` destructures `foundry.data.fields` at module scope, so
 * it cannot be imported under happy-dom — which made the original migration
 * tests vacuous (every case dynamic-imported `./npc`, caught the failure and
 * early-returned, asserting nothing). These functions have no Foundry dependency
 * and are tested directly against synthetic fixtures and the real bestiary pack.
 *
 * `NPCData._migrateData` delegates to these on document load (the same hook the
 * size/wounds/threat-level migrations use), so dragging a legacy compendium
 * actor into the world fixes its characteristics and weapons without rewriting
 * the pack JSON.
 *
 * Migration source is untyped, deserialized Foundry/pack data, so it is modelled
 * as a JSON value tree (`Json` / `JsonObject`) rather than `unknown`. That keeps
 * the values typed end-to-end with no `unknown`-boundary casts.
 */

/** A deserialized JSON value (the shape of raw pack / Foundry source data). */
export type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json };

/** A JSON object node. */
export type JsonObject = { [key: string]: Json };

import { coerceInt } from '../fields/coerce.ts';
import { CHARACTERISTIC_SHORT_TO_FULL } from '../shared/characteristics.ts';
import { skillCharacteristicMap } from '../shared/skill-definitions.ts';

// The characteristic short→full map is single-sourced in data/shared/characteristics.ts;
// re-exported here for the existing npc.ts import path.
export { CHARACTERISTIC_SHORT_TO_FULL };

/**
 * A characteristic in the structured per-characteristic shape the schema expects.
 * Declared as a `type` (not `interface`) so it carries an implicit index
 * signature and stays assignable to {@link Json}.
 */
type MigratedCharacteristic = {
    base: number;
    total: number;
    bonus: number;
    advancement: boolean;
};

/** A simple-mode weapon (the `weapons.simple[]` shape the schema expects). */
type SimpleWeapon = {
    name: string;
    damage: string;
    pen: number;
    range: string;
    rof: string;
    clip: number;
    reload: string;
    special: string;
    class: string;
};

/** Type guard narrowing a JSON value to an object node. */
export function isJsonObject(value: Json): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type guard narrowing a JSON value to an array node. */
export function isJsonArray(value: Json): value is Json[] {
    return Array.isArray(value);
}

/**
 * Coerce a scalar migration value to an integer, flooring and falling back.
 * `null` / `undefined` / `''` / non-numeric all yield the fallback.
 */
export function toInt(value: Json, fallback = 0): number {
    return coerceInt(value, fallback);
}

/**
 * Remap legacy characteristics into the structured per-characteristic shape,
 * in place on `source.characteristics`. Abbreviated keys (`ws`) become full
 * names (`weaponSkill`); scalar values (`"45"`) are wrapped into
 * `{ base, total, bonus, advancement }`. Idempotent — already-structured,
 * full-name data is left untouched.
 */
export function migrateCharacteristics(source: JsonObject): void {
    const chars = source['characteristics'];
    if (!isJsonObject(chars)) return;

    // Source keys are lower-cased (`ws`); the map is title-cased (`WS`).
    const shortToFull = new Map<string, string>(Object.entries(CHARACTERISTIC_SHORT_TO_FULL).map(([short, full]) => [short.toLowerCase(), full]));

    const migrated: JsonObject = {};
    let changed = false;
    for (const [key, value] of Object.entries(chars)) {
        const fullKey = shortToFull.get(key.toLowerCase()) ?? key;
        if (fullKey !== key) changed = true;

        if (isJsonObject(value)) {
            // Already an object — structured data OR a partial-update diff (e.g.
            // `{ base: 32 }` from an `actor.update('…characteristics.ws.base')`).
            // `_migrateData` runs on update diffs too, so a partial object must be
            // kept verbatim (possibly under a remapped key); only flat legacy
            // scalars (`"45"`) get wrapped. Requiring `'total' in value` here used
            // to mis-classify the partial `{ base: N }` diff as a legacy scalar and
            // reset every NPC characteristic to 30 on edit.
            migrated[fullKey] = value;
        } else {
            const total = toInt(value, 30);
            migrated[fullKey] = { base: total, total, bonus: Math.floor(total / 10), advancement: false } satisfies MigratedCharacteristic;
            changed = true;
        }
    }

    if (changed) source['characteristics'] = migrated;
}

/**
 * Convert a legacy NPC `weapons[]` array of stat blocks into the
 * `{ mode: 'simple', simple: [...] }` shape the schema expects, in place on
 * `source.weapons`. Coerces `pen`/`clip` to ints, folds `qualities` into
 * `special`, and infers melee vs ranged class from `range`. No-op once the
 * field is already an object.
 *
 * Stat-block parsing folds non-weapon rows into the same array — tool entries
 * ("Data-slate", "Auto-quill") and the catch-all "Gear/Other" / "Talents/Traits"
 * rows, all of which carry no real damage value (#254). Those are dropped so the
 * NPC's weapon list shows only actual weapons.
 */
export function migrateWeapons(source: JsonObject): void {
    const weapons = source['weapons'];
    if (!isJsonArray(weapons)) return;

    const realWeapons = weapons.filter((entry) => {
        if (!isJsonObject(entry)) return false;
        const damage = entry['damage'];
        const name = typeof entry['name'] === 'string' ? entry['name'] : '';
        // A weapon has a real damage value and isn't one of the parser's
        // catch-all gear/talents rows.
        return typeof damage === 'string' && damage.trim() !== '' && !/^(gear|talents?|traits?)\b/i.test(name.trim());
    });

    const simple: SimpleWeapon[] = realWeapons.map((entry) => {
        const w: JsonObject = isJsonObject(entry) ? entry : {};
        const range = typeof w['range'] === 'string' && w['range'] !== '' ? w['range'] : 'Melee';
        const isMelee = range === '-' || /melee/i.test(range);
        let special = '';
        if (typeof w['special'] === 'string') special = w['special'];
        else if (typeof w['qualities'] === 'string') special = w['qualities'];
        return {
            name: typeof w['name'] === 'string' ? w['name'] : '',
            damage: typeof w['damage'] === 'string' && w['damage'] !== '' ? w['damage'] : '1d10',
            pen: toInt(w['pen'], 0),
            range,
            rof: typeof w['rof'] === 'string' && w['rof'] !== '' ? w['rof'] : 'S/-/-',
            clip: toInt(w['clip'], 0),
            reload: typeof w['reload'] === 'string' && w['reload'] !== '' ? w['reload'] : '-',
            special,
            class: isMelee ? 'melee' : 'basic',
        };
    });

    source['weapons'] = { mode: 'simple', simple };
}

/**
 * Map a skill display name to its camelCase `trainedSkills` key by pure string
 * transform (no content table): "Sleight of Hand" → `sleightOfHand`, "Tech-Use"
 * → `techUse`, "Common Lore (Adeptus Arbites)" → `commonLore`. Specialisation
 * parentheticals are dropped from the key but kept in the stored display name.
 */
function skillNameToKey(name: string): string {
    const base = name.replace(/\([^)]*\)/g, ' ').trim();
    const words = base.split(/[\s/-]+/).filter((w) => w !== '');
    return words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('');
}

/**
 * Split a skill list on top-level commas, ignoring commas inside parentheses so a
 * multi-part specialisation ("Common Lore (Imperium, Adeptus Arbites)") stays one
 * entry instead of fragmenting into nonsense skills.
 */
function splitSkillList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of list) {
        if (char === '(') depth += 1;
        else if (char === ')') depth = Math.max(0, depth - 1);
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * Parse a raw `skills` stat-block string into the structured `trainedSkills` map
 * the schema expects (#256/#497).
 *
 * The **authored** format across all seven lines is a single comma-separated list
 * whose per-skill parenthetical carries the governing characteristic:
 *
 *   "Athletics (S), Awareness (Per), Dodge (Ag), Common Lore (Adeptus Arbites)"
 *
 * The original parser required a colon-prefixed, line-per-characteristic form
 * ("S: Intimidate\nAg: Dodge") that **no actor in the corpus uses** — 1558 authored
 * actors are the plain comma list, 0 use the documented shape — so it `continue`d
 * on every line and silently produced nothing. Every NPC's known-skill list was
 * empty, and no compiled pack actor had `trainedSkills` at all.
 *
 * Parsing rules:
 *  - A trailing parenthetical that names a characteristic abbreviation (S/Ag/Per…)
 *    IS the characteristic and is stripped from the display name; any other
 *    parenthetical is a specialisation and stays in the name.
 *  - When the string names no characteristic, fall back to the canonical
 *    SKILL_DEFINITIONS catalogue rather than storing an empty one.
 *  - A colon is only read as a characteristic prefix when the text before it is a
 *    real abbreviation. That preserves the legacy line format while fixing the 108
 *    actors whose colon comes from a garbled skill name ("Forbidden: Lore
 *    (Daemonology)") — previously everything before that colon was discarded,
 *    losing every skill listed ahead of it.
 *  - A trailing +10/+20/+30 is parsed off as the advance.
 *
 * No-op when `trainedSkills` is already populated, so a hand-curated NPC is never
 * clobbered.
 */
/** One parsed entry from a printed skills line, before it is keyed into a map. */
export interface ParsedSkillEntry {
    /** Catalogue skill key (`awareness`, `commonLore`, …). */
    key: string;
    /** Display name including any specialisation ("Common Lore (Underworld)"). */
    name: string;
    /** Specialisation text alone, or `''` for a non-specialist entry. */
    specialization: string;
    /** Full characteristic key, or `''` when neither the entry nor the catalogue names one. */
    characteristic: string;
    /** Rank 1–4 (Known / +10 / +20 / +30). */
    advance: number;
    /**
     * Any printed advance BEYOND the +30 rank ceiling, kept as a flat modifier so a
     * homebrew "+50" survives as rank 4 plus a +20 bonus instead of silently
     * truncating to +30. 0 for every RAW entry.
     */
    bonus: number;
}

/**
 * Parse a printed skills line into its individual entries, in order.
 *
 * Exposed separately from {@link migrateSkills} so the authoring tooling can group
 * multiple specialisations of one skill into `entries[]` rather than colliding them
 * on the base key — the map form necessarily keeps only the last of them. One
 * parser, two consumers.
 */
export function parseSkillEntries(raw: string): ParsedSkillEntry[] {
    const shortToFull = new Map<string, string>(Object.entries(CHARACTERISTIC_SHORT_TO_FULL).map(([short, full]) => [short.toLowerCase(), full]));
    const catalogueChar = skillCharacteristicMap();
    const parsed: ParsedSkillEntry[] = [];

    // Legacy stat blocks separate characteristic groups by newline OR by a pipe
    // ("S: Intimidate +50, Athletics +10 | T: | Ag: Operate"). Splitting on newline
    // alone glued the pipe-joined groups into one entry and minted keys like
    // `athletics+10|T:|Ag:Operate` (#503).
    for (const line of raw.split(/[\n|]/)) {
        if (line.trim() === '') continue;

        // Legacy "Char: skill, skill" form — ONLY when the prefix really is a
        // characteristic abbreviation, so a colon inside a skill name can't be
        // mistaken for one.
        let lineCharacteristic = '';
        let list = line;
        const colon = line.indexOf(':');
        if (colon >= 0) {
            const prefixed = shortToFull.get(line.slice(0, colon).trim().toLowerCase());
            if (prefixed !== undefined) {
                lineCharacteristic = prefixed;
                list = line.slice(colon + 1);
            }
        }

        for (const rawEntry of splitSkillList(list)) {
            // Sentence-ending punctuation on the last entry of a printed line
            // ("… Scrutiny (Per).") otherwise rides into the key as `scrutiny.`.
            let name = rawEntry.replace(/[.;\s]+$/, '').trim();

            // Inverted lore form. Several FFG stat blocks print the lore skills as
            // "Lore: Scholastic (Imperial Creed)" rather than "Scholastic Lore
            // (Imperial Creed)", which keys as `lore:Scholastic` and matches nothing.
            // Reorder generically — the kind is whatever word follows the colon, never
            // an enumerated list — and let the catalogue check reject a bogus kind.
            name = name.replace(/^Lore:\s*([A-Za-z]+)\b/, '$1 Lore');

            // The same stat blocks fold the advance INSIDE the specialisation
            // ("Scholastic Lore (Imperial Creed +10)"); lift it out so the ladder sees it.
            name = name.replace(/\(([^)]*?)\s*(\+\d+)\s*\)\s*$/, '($1) $2');

            // A printed entry can carry several trailing groups in either order —
            // "Athletics (S) +30 (Ag) +20", "Operate (Surface) (Ag) +20". Peel them
            // off until neither matches, keeping the HIGHEST advance seen and the
            // last recognised characteristic. Peeling only one left the remainder
            // glued into the key (`athletics+30`).
            let plus = 0;
            let characteristic = lineCharacteristic;
            for (;;) {
                const advMatch = /\+(\d+)\s*$/.exec(name);
                if (advMatch !== null) {
                    plus = Math.max(plus, toInt(advMatch[1], 0));
                    name = name.slice(0, advMatch.index).trim();
                    continue;
                }
                const parenMatch = /\(([^)]*)\)\s*$/.exec(name);
                if (parenMatch !== null) {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types this capture-group read as `string`, while tsconfig.json has it on and requires the fallback.
                    const inner = (parenMatch[1] ?? '').trim();
                    const asCharacteristic = shortToFull.get(inner.toLowerCase());
                    // Only a characteristic abbreviation is a peelable group; a real
                    // specialisation ("Common Lore (Underworld)") stays in the name.
                    if (asCharacteristic !== undefined) {
                        characteristic = asCharacteristic;
                        name = name.slice(0, parenMatch.index).trim();
                        continue;
                    }
                }
                break;
            }

            // Explicit "this creature has no skills" markers. Beasts and constructs
            // print these; they are an absence of data, not a skill named "None".
            if (/^(none|n\/a|-{1,2}|—)$/i.test(name)) continue;

            const key = skillNameToKey(name);
            if (key === '') continue;
            if (characteristic === '') characteristic = catalogueChar[key] ?? '';

            // Rank ladder: Known(1) / +10(2) / +20(3) / +30(4). `advance` is the
            // authored source of truth (#503); the flags are cumulative mirrors.
            const advance = plus >= 30 ? 4 : plus >= 20 ? 3 : plus >= 10 ? 2 : 1;
            // Anything printed above +30 has no rank to live in — carry the overflow
            // as a flat bonus rather than truncating it away (homebrew "+50").
            const bonus = Math.max(0, plus - (advance - 1) * 10);

            // Whatever parenthetical survived the peel is the specialisation.
            const specMatch = /\(([^)]*)\)\s*$/.exec(name);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types this capture-group read as `string`, while tsconfig.json has it on and requires the fallback.
            const specialization = specMatch !== null ? (specMatch[1] ?? '').trim() : '';
            parsed.push({ key, name, specialization, characteristic, advance, bonus });
        }
    }
    return parsed;
}

export function migrateSkills(source: JsonObject): void {
    const raw = source['skills'];
    if (typeof raw !== 'string' || raw.trim() === '') return;
    const existing = source['trainedSkills'];
    if (isJsonObject(existing) && Object.keys(existing).length > 0) return;

    const trained: JsonObject = {};
    for (const entry of parseSkillEntries(raw)) {
        trained[entry.key] = {
            name: entry.name,
            characteristic: entry.characteristic,
            advance: entry.advance,
            trained: true,
            plus10: entry.advance >= 2,
            plus20: entry.advance >= 3,
            plus30: entry.advance >= 4,
            bonus: entry.bonus,
        };
    }
    if (Object.keys(trained).length > 0) source['trainedSkills'] = trained;
}

/**
 * Migrate the legacy flat `armourPoints` string ("H7 AR7 AL7 B7 LR7 LL7") into the
 * structured `armour.locations` map. Without this every NPC's soak silently defaults
 * to 0. DH2 hit-location prefixes: H=head, AR=right arm, AL=left arm, B=body,
 * LR=right leg, LL=left leg. Idempotent — deletes the legacy key once mapped, and
 * only fires when the flat string is present (authored `armour` objects are untouched).
 * @param {JsonObject} source - The source system data (mutated in place)
 */
export function migrateArmourPoints(source: JsonObject): void {
    const raw = source['armourPoints'];
    // No authored AP line → leave `armour.authored` false so the NPC DataModel
    // derives armour from Toughness + worn items at prepare time.
    if (typeof raw !== 'string' || raw.trim() === '') return;
    delete source['armourPoints'];
    const m = /H\s*(\d+)\s+AR\s*(\d+)\s+AL\s*(\d+)\s+B\s*(\d+)\s+LR\s*(\d+)\s+LL\s*(\d+)/i.exec(raw);
    if (m === null) {
        // Present but unparseable: still a raw/source-material intent. Mark it
        // authored so the runtime keeps the (possibly zero) authored value rather
        // than silently deriving over what a book printed.
        const existing = isJsonObject(source['armour']) ? source['armour'] : {};
        source['armour'] = { ...existing, authored: true };
        return;
    }
    source['armour'] = {
        mode: 'locations',
        total: toInt(m[4]),
        authored: true,
        locations: {
            head: toInt(m[1]),
            body: toInt(m[4]),
            leftArm: toInt(m[3]),
            rightArm: toInt(m[2]),
            leftLeg: toInt(m[6]),
            rightLeg: toInt(m[5]),
        },
    };
}

/**
 * Migrate an Imperium Maledictum flat scalar `armour` value into the structured
 * `{ mode: 'simple', total }` shape the schema expects. IM statblocks print a
 * single Armour rating (e.g. `2`) rather than the FFG per-location `armourPoints`
 * string, so without this the flat number fails validation and armour resolves to
 * 0 in `getArmourAt`. Guarded on `typeof number` so already-structured FFG armour
 * objects are left untouched; idempotent.
 * @param {object} source - The source system data
 */
export function migrateArmour(source: JsonObject): void {
    const raw = source['armour'];
    if (typeof raw !== 'number') return;
    source['armour'] = { mode: 'simple', total: raw < 0 ? 0 : Math.floor(raw) };
}

/**
 * Migrate the legacy flat `move` string ("3/6/9/18" = half/full/charge/run) into the
 * structured `movement` object, flagged `movementManual: true` so the printed line is
 * NOT overwritten by the Agility-bonus recompute (many creatures deviate from the AgB
 * formula — fast beasts, flyers, slow constructs). Idempotent — deletes the legacy key.
 * @param {JsonObject} source - The source system data (mutated in place)
 */
export function migrateMove(source: JsonObject): void {
    const raw = source['move'];
    if (typeof raw !== 'string' || raw.trim() === '') return;
    delete source['move'];
    const parts = raw
        .trim()
        .split('/')
        .map((x) => toInt(x.trim(), Number.NaN));
    if (parts.length < 4 || parts.some((n) => Number.isNaN(n))) return;
    source['movement'] = { half: parts[0], full: parts[1], charge: parts[2], run: parts[3] };
    source['movementManual'] = true;
}
