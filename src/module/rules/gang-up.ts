/**
 * Ganging Up / outnumbering melee bonus (#417).
 *
 * When attackers outnumber a foe in melee, each additional ally engaged with the
 * same target grants a flat bonus to Weapon Skill attack rolls against that
 * target. The bonus is +10 per additional attacker, capped per game line.
 *
 * Verified against the core rulebooks of the FFG family: Ganging Up grants +10
 * per attacker beyond the first, to a maximum of +30 (four or more attackers).
 * Cubicle 7's Imperium Maledictum has no equivalent Ganging Up rule, so it
 * resolves to a no-op config (`perAllyBonus: 0`). The mode/cap is transcribed
 * game mechanics (a fixed mapping over the seven GameSystemId values), not
 * compendium content — Direction #7.
 *
 * The engagement geometry is pure: callers pass token-like rectangles (grid
 * origin in pixels + width/height in grid squares + disposition), and this
 * module decides adjacency, counts the attacker's engaged allies, and computes
 * the bonus. Nothing here touches the Foundry canvas — the dialog adapts live
 * `Token` placeables into {@link GangUpTokenLike} at the call site.
 */

import { nonNegInt } from './_num.ts';

/** Per-line Ganging Up configuration. */
export interface GangUpConfig {
    /** Bonus granted per attacker beyond the first (0 disables the rule). */
    perAllyBonus: number;
    /** Maximum total bonus, regardless of how many allies pile on. */
    maxBonus: number;
}

/** Lines that use the standard FFG Ganging Up rule (+10/ally, cap +30). */
const STANDARD_GANG_UP: GangUpConfig = { perAllyBonus: 10, maxBonus: 30 };

/** Imperium Maledictum has no Ganging Up rule. */
const NO_GANG_UP: GangUpConfig = { perAllyBonus: 0, maxBonus: 0 };

/**
 * Resolve the Ganging Up config for a game line. Accepts the raw
 * `system.gameSystem` string; the six FFG lines share the standard rule, IM (and
 * any unknown line) resolves to the no-op config. Exhaustiveness across the
 * seven GameSystemId values is pinned by gang-up.test.ts.
 */
export function gangUpConfigFor(gameSystem: string | undefined): GangUpConfig {
    if (gameSystem === 'im') return NO_GANG_UP;
    return STANDARD_GANG_UP;
}

/**
 * A token reduced to what the outnumbering math reads. `x`/`y` are the grid
 * origin in pixels (Foundry `TokenDocument.x/y`); `width`/`height` are the
 * token's footprint in grid squares; `disposition` is the Foundry disposition
 * flag (-1 hostile / 0 neutral / 1 friendly). `id` disambiguates the attacker
 * and target from the scene roster.
 */
export interface GangUpTokenLike {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    disposition: number;
}

/** The integer grid-cell rectangle a token occupies (inclusive bounds). */
interface CellRect {
    col0: number;
    row0: number;
    col1: number;
    row1: number;
}

/** Reduce a token's pixel origin + grid footprint to its occupied cell rect. */
function cellRect(token: GangUpTokenLike, gridSize: number): CellRect {
    const size = gridSize > 0 ? gridSize : 1;
    const col0 = Math.round(token.x / size);
    const row0 = Math.round(token.y / size);
    const width = Math.max(1, Math.round(token.width));
    const height = Math.max(1, Math.round(token.height));
    return { col0, row0, col1: col0 + width - 1, row1: row0 + height - 1 };
}

/**
 * Whether two tokens are engaged in melee — their occupied cell rectangles touch
 * or overlap (Chebyshev gap ≤ 1), i.e. they are on adjacent or the same grid
 * squares. Diagonal adjacency counts. Pure.
 */
export function tokensEngagedInMelee(a: GangUpTokenLike, b: GangUpTokenLike, gridSize: number): boolean {
    if (a.id === b.id) return false;
    const ra = cellRect(a, gridSize);
    const rb = cellRect(b, gridSize);
    const gapX = Math.max(0, ra.col0 - rb.col1, rb.col0 - ra.col1);
    const gapY = Math.max(0, ra.row0 - rb.row1, rb.row0 - ra.row1);
    return Math.max(gapX, gapY) <= 1;
}

export interface GangUpInput {
    /** The attacking token. */
    attacker: GangUpTokenLike;
    /** The token being attacked. */
    target: GangUpTokenLike;
    /** Every token on the scene (attacker/target included; filtered internally). */
    tokens: readonly GangUpTokenLike[];
    /** Grid square size in pixels (Foundry `canvas.grid.size`). */
    gridSize: number;
    /** Resolved per-line config. */
    config: GangUpConfig;
}

export interface GangUpResult {
    /** Number of attackers (attacker + allies) engaged with the target. */
    attackerCount: number;
    /** Attackers beyond the first (drives the bonus before the cap). */
    additionalAllies: number;
    /** Final to-hit bonus after applying per-ally value and the cap. */
    bonus: number;
}

/**
 * Count the attackers engaged in melee with `target` on `attacker`'s side: every
 * token sharing the attacker's disposition that is adjacent to the target,
 * including the attacker themselves. The target is excluded even if (degenerately)
 * it shares the disposition. Pure.
 */
export function countMeleeAttackers(attacker: GangUpTokenLike, target: GangUpTokenLike, tokens: readonly GangUpTokenLike[], gridSize: number): number {
    let count = 0;
    for (const token of tokens) {
        if (token.id === target.id) continue;
        if (token.disposition !== attacker.disposition) continue;
        if (token.id === attacker.id || tokensEngagedInMelee(token, target, gridSize)) count += 1;
    }
    return count;
}

/**
 * Compute the Ganging Up to-hit bonus for a melee attack. Returns zero bonus
 * when the attacker is not engaged with the target, when no allies pile on, or
 * when the line has no Ganging Up rule (`perAllyBonus: 0`). Pure — the caller
 * supplies token geometry and the resolved config.
 */
export function computeGangUpModifier(input: GangUpInput): GangUpResult {
    const { attacker, target, tokens, gridSize, config } = input;
    // The attacker must actually be in melee with the target for the rule to fire.
    if (!tokensEngagedInMelee(attacker, target, gridSize)) {
        return { attackerCount: 0, additionalAllies: 0, bonus: 0 };
    }
    const attackerCount = countMeleeAttackers(attacker, target, tokens, gridSize);
    const additionalAllies = Math.max(0, attackerCount - 1);
    const rawBonus = additionalAllies * nonNegInt(config.perAllyBonus);
    const bonus = Math.min(rawBonus, nonNegInt(config.maxBonus));
    return { attackerCount, additionalAllies, bonus };
}
