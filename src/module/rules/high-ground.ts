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
 * Whether the RAW Higher Ground bonus auto-applies: the attacker is strictly
 * above the target AND the line's mode matches the attack type (melee mode →
 * melee attack; ranged mode → ranged attack). Pure — the caller supplies the
 * resolved mode, attack type, and the two token elevations.
 */
export function appliesHighGround(mode: HighGroundMode, isRanged: boolean, attackerElevation: number, targetElevation: number): boolean {
    if (mode === 'none') return false;
    if (attackerElevation <= targetElevation) return false;
    return mode === 'ranged' ? isRanged : !isRanged;
}
