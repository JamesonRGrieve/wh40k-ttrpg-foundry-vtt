/**
 * Weapons and rounds that deal no damage (#601) — stun, smoke, blind, web and
 * haywire grenades, webbers, bolas, launcher rounds that only carry a payload.
 * The books print a dash in their Damage column; the schema records it as the
 * structured `damage.none: true` flag on the `DamageTemplate` profile (with an
 * empty `formula`), which every line's per-line variant branch can carry.
 *
 * An empty `formula` WITHOUT `none` still means "no damage authored" and keeps the
 * weapon's legacy default dice, so `none` is the only thing that switches the damage
 * roll off. Such a weapon still resolves its attack and applies its qualities
 * (Concussive, Snare, Smoke, Blind, Haywire, …); it only skips the damage roll.
 *
 * Content-agnostic: no weapon is named here. The flag lives in the compendium data.
 */

import { isLineVariantContainer } from '../utils/item-variant-utils.ts';

/** The dash spellings the books (and older pack data) use for "no damage". */
const NO_DAMAGE_NOTATIONS: ReadonlySet<string> = new Set(['-', '–', '—']);

/** Is this a damage formula written in the books' "no damage" dash notation? */
function isNoDamageNotation(formula: string): boolean {
    return NO_DAMAGE_NOTATIONS.has(formula.trim());
}

/**
 * Rewrite a legacy dash `formula` to the explicit `{ formula: '', none: true }`
 * profile, in place, at every per-line variant level of `damage`
 * (`damage: { dh2: { formula: '-' }, rt: {...} }`, or a flat profile). Without
 * this the dash fails `FormulaField` validation and the whole item is rejected.
 * Idempotent; a profile with a real formula is left untouched.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `_migrateData` source payload, before schema validation
export function normalizeNoDamageNotation(source: Record<string, unknown>): void {
    normalizeDamageValue(source['damage']);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `_migrateData` source payload, before schema validation
function normalizeDamageValue(damage: unknown): void {
    if (typeof damage !== 'object' || damage === null || Array.isArray(damage)) return;
    if (isLineVariantContainer(damage)) {
        for (const branch of Object.values(damage)) normalizeDamageValue(branch);
        return;
    }
    if ('formula' in damage && typeof damage.formula === 'string' && isNoDamageNotation(damage.formula)) {
        Object.assign(damage, { formula: '', none: true });
    }
}

/** The inputs that decide whether a weapon's attack rolls damage. */
interface DamageProfileState {
    /** The weapon's own profile is "no damage". */
    none: boolean;
    /** The chambered full-profile round, which replaces the weapon's profile; null when none is loaded. */
    override: { none?: boolean } | null;
    /** The active firing mode's own damage formula, or '' when it inherits the weapon's. */
    modeDamage: string;
}

/**
 * Does an attack with this profile roll damage? A firing mode that authors its own
 * dice wins, then a chambered full-profile round, then the weapon's own profile.
 */
export function profileDealsDamage(state: DamageProfileState): boolean {
    if (state.modeDamage !== '') return true;
    if (state.override !== null) return state.override.none !== true;
    return !state.none;
}
