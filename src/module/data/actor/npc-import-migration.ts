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

/**
 * Characteristic short label → full schema key (Core Rulebook abbreviations).
 * Legacy bestiary/NPC source stores characteristics under abbreviated keys
 * (`ws`, `bs`, …); the schema uses the full names (`weaponSkill`, …).
 */
export const CHARACTERISTIC_SHORT_TO_FULL: Record<string, string> = {
    WS: 'weaponSkill',
    BS: 'ballisticSkill',
    S: 'strength',
    T: 'toughness',
    Ag: 'agility',
    Int: 'intelligence',
    Per: 'perception',
    WP: 'willpower',
    Fel: 'fellowship',
    Inf: 'influence',
};

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
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.floor(num);
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

        if (isJsonObject(value) && 'total' in value) {
            // Already structured — keep (possibly under a remapped key).
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
 */
export function migrateWeapons(source: JsonObject): void {
    const weapons = source['weapons'];
    if (!isJsonArray(weapons)) return;

    const simple: SimpleWeapon[] = weapons.map((entry) => {
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
