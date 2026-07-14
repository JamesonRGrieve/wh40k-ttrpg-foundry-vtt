/**
 * Weapon firing modes (#430) — multiple firing profiles on a single weapon.
 *
 * Some weapons fire in more than one configuration (a mining melta's Focused vs
 * Broad beam, a weapon with a single/scatter setting). Rather than authoring one
 * item document per configuration, a weapon carries several named modes on
 * `system.modes`, each overriding a subset of the base stats, with exactly one
 * active at a time (`system.state.activeMode`, an index).
 *
 * This module is the content-agnostic core: it selects the active mode and
 * applies its overrides to already-resolved effective stats. The modes
 * themselves — labels, per-mode damage / penetration / range / qualities — are
 * line-authored content on `system.modes` (variantizable, per src/packs
 * CLAUDE.md), never hardcoded here (Direction #7). A weapon with no modes
 * behaves exactly as before: the single profile IS the base attack block.
 *
 * Distinct from `weapon-activation.ts` (a binary powered↔off toggle) and from
 * the rate-of-fire "fire modes" (`availableFireModes`, single/semi/full shots):
 * this is N named stat *profiles*.
 */

/** One firing mode's authored profile. Empty / null fields inherit the base attack. */
export interface WeaponFiringMode {
    /** Display label (e.g. "Focused", "Broad"). */
    label: string;
    /** Damage formula override, or '' to inherit the base. */
    damage: string;
    /** Damage bonus override, or null to inherit the base. */
    damageBonus: number | null;
    /** Penetration override, or null to inherit the base. */
    penetration: number | null;
    /** Range (m) override, or null to inherit the base. */
    range: number | null;
    /** Qualities this mode adds. */
    addedQualities: Iterable<string>;
    /** Qualities this mode removes. */
    removedQualities: Iterable<string>;
}

/** Whether the weapon has any authored firing modes. */
export function hasFiringModes(modes: readonly WeaponFiringMode[] | undefined | null): boolean {
    return modes !== undefined && modes !== null && modes.length > 0;
}

/**
 * The active firing mode, or null when the weapon has no modes. The stored index
 * is clamped into range so a stale / out-of-bounds `activeMode` never throws.
 */
export function activeFiringMode(modes: readonly WeaponFiringMode[] | undefined | null, activeIndex: number): WeaponFiringMode | null {
    if (modes === undefined || modes === null || modes.length === 0) return null;
    const i = Number.isInteger(activeIndex) ? Math.min(Math.max(activeIndex, 0), modes.length - 1) : 0;
    return modes.at(i) ?? null;
}

/** Apply the active mode's quality add / remove to an already-resolved quality set. */
export function applyModeQualities(qualities: Set<string>, mode: WeaponFiringMode | null): Set<string> {
    if (mode === null) return qualities;
    const out = new Set(qualities);
    for (const q of mode.removedQualities) out.delete(q);
    for (const q of mode.addedQualities) out.add(q);
    return out;
}

/** The active mode's damage formula, or `fallback` when the mode does not override it. */
export function modeDamageFormula(mode: WeaponFiringMode | null, fallback: string): string {
    return mode !== null && mode.damage !== '' ? mode.damage : fallback;
}

/** The active mode's damage bonus, or `fallback` when the mode does not override it. */
export function modeDamageBonus(mode: WeaponFiringMode | null, fallback: number): number {
    return mode !== null && mode.damageBonus !== null ? mode.damageBonus : fallback;
}

/** The active mode's penetration, or `fallback` when the mode does not override it. */
export function modePenetration(mode: WeaponFiringMode | null, fallback: number): number {
    return mode !== null && mode.penetration !== null ? mode.penetration : fallback;
}

/** The active mode's range, or `fallback` when the mode does not override it. */
export function modeRange(mode: WeaponFiringMode | null, fallback: number): number {
    return mode !== null && mode.range !== null ? mode.range : fallback;
}
