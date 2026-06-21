/**
 * Shared size clamp / name-map + per-field integer coercion for DataModel
 * migrate/clean passes (#347).
 *
 * The creature template and the NPC model both clamp `size` to `[1, 10]`, both
 * map the legacy `miniscule…immense` size names to integers, and both coerce a
 * handful of flat numeric fields (wounds, fatigue, fate, psy, …) the same way
 * during migration/cleaning. These helpers are the single owners so a size-band
 * change or a coercion-rule change lands in one place. Scalar coercion delegates
 * to {@link coerceInt} from `../fields/coerce.ts`.
 */

import { coerceInt } from '../fields/coerce.ts';
import type { RawSource } from './raw-source.ts';

/** Inclusive bounds for the creature/NPC `size` band. */
const MIN_SIZE = 1;
const MAX_SIZE = 10;

/** Default size integer for an unrecognised size name (`average`). */
const DEFAULT_SIZE = 4;

/**
 * Legacy size-name → integer band. Author keeps `miniscule…immense`; the schema
 * stores an integer in `[1, 10]`.
 */
export const SIZE_NAME_MAP: Record<string, number> = {
    miniscule: 1,
    puny: 2,
    scrawny: 3,
    average: 4,
    hulking: 5,
    enormous: 6,
    massive: 7,
    immense: 8,
};

/** Clamp a numeric size into the inclusive `[1, 10]` band. */
export function clampSize(value: number): number {
    if (value < MIN_SIZE) return MIN_SIZE;
    if (value > MAX_SIZE) return MAX_SIZE;
    return value;
}

/**
 * Resolve a legacy size-name string to its integer band, defaulting to `average`
 * (4) for an unrecognised name. Case-insensitive.
 */
export function sizeNameToInt(name: string): number {
    return SIZE_NAME_MAP[name.toLowerCase()] ?? DEFAULT_SIZE;
}

/**
 * Coerce the listed numeric fields of `obj` to integers in place, skipping any
 * field that is `undefined`. Each field's fallback is `defaults[field]` (0 when
 * unspecified) — the same `if (obj[f] !== undefined) obj[f] = coerceInt(obj[f],
 * default)` wrapper that was repeated across creature.ts / npc.ts migrate+clean.
 *
 * @param obj - The (untyped) source bag being migrated/cleaned.
 * @param fields - The flat field names to coerce.
 * @param defaults - Optional per-field fallback values; missing → 0.
 */
export function coerceIntFields(obj: RawSource, fields: readonly string[], defaults: Record<string, number> = {}): void {
    for (const field of fields) {
        if (obj[field] !== undefined) {
            obj[field] = coerceInt(obj[field], defaults[field] ?? 0);
        }
    }
}
