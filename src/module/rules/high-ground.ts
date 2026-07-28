/**
 * RAW "Higher Ground" combat modifier, per game line (#407).
 *
 * Verified against each core rulebook: the five FFG lines that scope it to melee
 * grant +10 to Weapon Skill tests from higher ground (DH2, BC, DW, OW, RT); DH1
 * instead grants +10 to shooting (Ballistic Skill) from higher ground; Cubicle
 * 7's Imperium Maledictum has no such rule. This module maps each line to its
 * mode and decides, from token elevation, whether the +10 auto-applies. The
 * modifier VALUE (+10) lives in the situational-modifier registry
 * (`attack-options.ts`: `higherGround` for melee, `highGround` for ranged); this
 * module only selects the mode + key, never restating the number.
 *
 * Content-agnostic system mechanics (a fixed mapping over the seven GameSystemId
 * values, transcribed from the rulebooks), not compendium content — Direction #7.
 */

/** Which attack type the line's Higher Ground bonus applies to. */
export type HighGroundMode = 'melee' | 'ranged' | 'none';

/**
 * The Higher Ground mode for a game line (verified against each core rulebook,
 * #407). Accepts the raw `system.gameSystem` string; an unknown line (or IM,
 * which has no such rule) resolves to `none`. Exhaustiveness across the seven
 * `GameSystemId` values is pinned by high-ground.test.ts.
 */
const MELEE_HIGH_GROUND_LINES: ReadonlySet<string> = new Set(['dh2', 'bc', 'dw', 'ow', 'rt']);

export function highGroundMode(system: string | undefined): HighGroundMode {
    if (system === 'dh1') return 'ranged';
    if (system !== undefined && MELEE_HIGH_GROUND_LINES.has(system)) return 'melee';
    return 'none';
}

/**
 * The situational-modifier key the Higher Ground bonus lives under for a mode:
 * the melee registry uses `higherGround`, the ranged registry `highGround`
 * (`attack-options.ts`). Returns null for `none`.
 */
export function highGroundKey(mode: HighGroundMode): 'higherGround' | 'highGround' | null {
    if (mode === 'melee') return 'higherGround';
    if (mode === 'ranged') return 'highGround';
    return null;
}

/**
 * Whether the RAW Higher Ground bonus auto-applies: the attacker is above the
 * target by more than `band` AND the line's mode matches the attack type (melee
 * mode → melee attack; ranged mode → ranged attack). Pure — the caller supplies
 * the resolved mode, attack type, the two token elevations, and the band.
 *
 * **Levels pairing (#407).** No Levels-specific API is needed: with
 * theripper93's Levels installed a token's `elevation` IS its floor's base
 * height, so comparing elevations already compares floors — an attacker on the
 * upper storey qualifies, two tokens on the same floor never do. Without Levels
 * the identical comparison runs on raw elevation, which is why this works in
 * both worlds.
 *
 * `band` defaults to 0, which is RAW (strictly above is higher ground). A GM can
 * raise it so a crate or a half-step of rubble doesn't grant the +10; on a
 * Levels map any band below the floor height still lets a genuine storey count.
 * @param {HighGroundMode} mode  The line's high-ground mode.
 * @param {boolean} isRanged  Whether this is a ranged attack.
 * @param {number} attackerElevation  Attacker token elevation.
 * @param {number} targetElevation  Target token elevation.
 * @param {number} [band]  Minimum elevation delta; 0 (default) is RAW.
 * @returns {boolean}  True when the bonus applies.
 */
export function appliesHighGround(mode: HighGroundMode, isRanged: boolean, attackerElevation: number, targetElevation: number, band = 0): boolean {
    if (mode === 'none') return false;
    if (!Number.isFinite(attackerElevation) || !Number.isFinite(targetElevation)) return false;
    // A non-finite or negative band is a misconfiguration, not licence to widen
    // the rule — fall back to RAW rather than granting the bonus more often.
    const threshold = Number.isFinite(band) && band > 0 ? band : 0;
    if (attackerElevation - targetElevation <= threshold) return false;
    return mode === 'ranged' ? isRanged : !isRanged;
}
