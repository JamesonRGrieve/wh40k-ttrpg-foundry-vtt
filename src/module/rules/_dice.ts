/**
 * Shared d100 dice primitives for the `rules/` layer (#301).
 *
 * Before this module each rule re-derived the same Degrees-of-Success math,
 * its own `type Rng`, and a near-verbatim opposed-test resolver. Centralising
 * them here makes the d100 engine identical across all seven game systems
 * instead of accidentally per-file. Domain modules keep their named wrappers
 * (`resolveRammingToHit`, `resolveDamageOpponent`, …) and map their fields onto
 * these cores — the public API of each rule is unchanged.
 *
 * Everything here is pure: callers pre-roll their dice (or inject an `Rng`),
 * so results are deterministic and unit-testable with a seeded generator.
 */

/** A pseudo-random source returning a float in [0, 1). Inject for determinism. */
export type Rng = () => number;

/**
 * Degrees of Success for a passed d100 test (`roll ≤ target`): the full tens of
 * the margin, plus one — a bare pass is 1 DoS (core.md §"Degrees of Success").
 * A failed roll (`roll > target`) yields 0, so callers can use the return value
 * directly without a separate pass check.
 *
 * `extra: true` switches to the "extra degrees" convention (`max(0,
 * floor(margin / 10))`): a bare pass scores 0 and each full ten of margin adds
 * one — the form Black Crusade rituals and Only War logistics report bonuses
 * in, where the bare success already grants the base effect.
 */
export function degreesOfSuccess(roll: number, target: number, options?: { extra?: boolean }): number {
    if (roll > target) return 0;
    if (options?.extra === true) return Math.max(0, Math.floor((target - roll) / 10));
    return Math.floor((target - roll) / 10) + 1;
}

/**
 * Degrees of Failure for a failed d100 test (`roll > target`): the full tens of
 * the margin, plus one — a bare fail is 1 DoF. A passing roll yields 0.
 *
 * `inclusive: false` counts the margin from the first point *past* the target
 * (`floor((roll − target − 1) / 10) + 1`), matching the Navigator-power
 * convention; the default counts from the target itself.
 *
 * `extra: true` switches to the "extra degrees" convention (`max(0,
 * floor(margin / 10))`): a bare fail scores 0, mirroring {@link degreesOfSuccess}
 * with `extra` for the BC-ritual / OW-logistics report form. `extra` takes
 * precedence over `inclusive`.
 */
export function degreesOfFailure(roll: number, target: number, options?: { inclusive?: boolean; extra?: boolean }): number {
    if (roll <= target) return 0;
    if (options?.extra === true) return Math.max(0, Math.floor((roll - target) / 10));
    const margin = options?.inclusive === false ? roll - target - 1 : roll - target;
    return Math.floor(margin / 10) + 1;
}

/** One side of an opposed d100 test: its d100 roll and effective target. */
export interface OpposedSide {
    /** This side's d100 roll (1–100). */
    roll: number;
    /** This side's effective target number (characteristic/skill + modifiers). */
    target: number;
}

/** Outcome of an opposed d100 test, scored from the first side's perspective. */
export interface OpposedResult {
    /** True when the first side wins the contest. */
    success: boolean;
    /** First side's DoS (0 when it failed its own roll). */
    aDoS: number;
    /** Second side's DoS (0 when it failed its own roll). */
    bDoS: number;
    /** `aDoS − bDoS` — negative when the second side scored more. */
    netDoS: number;
}

/**
 * Resolve an opposed d100 test between two sides. Each rolls against its own
 * target; the side with more Degrees of Success wins. `tie` decides equal-DoS
 * contests — `'a'` favours the first side (it wins on `netDoS ≥ 0`), `'b'`
 * favours the second (the first side must strictly outscore, `netDoS > 0`).
 *
 * Because {@link degreesOfSuccess} already returns 0 for a failed roll, a side
 * that misses its own test contributes 0 DoS, so a both-fail contest is decided
 * purely by the tie rule — matching the hand-written resolvers this replaces.
 */
export function resolveOpposed(a: OpposedSide, b: OpposedSide, options: { tie: 'a' | 'b' }): OpposedResult {
    const aDoS = degreesOfSuccess(a.roll, a.target);
    const bDoS = degreesOfSuccess(b.roll, b.target);
    const netDoS = aDoS - bDoS;
    const success = options.tie === 'a' ? netDoS >= 0 : netDoS > 0;
    return { success, aDoS, bDoS, netDoS };
}

/** A roll-table row keyed by an inclusive `[low, high]` d100 range. */
export interface BandRow {
    /** Inclusive `[low, high]` bounds the roll falls within. */
    range: readonly [number, number];
}

/**
 * Find the row whose inclusive `[low, high]` range — read via the `range`
 * accessor — contains `roll`. With `clamp: true` (default), a roll below the
 * first row's low / above the last row's high snaps to the first / last row
 * instead of returning undefined — roll tables are exhaustive, so an out-of-band
 * roll means a modifier pushed past the table edge. With `clamp: false` an
 * out-of-band roll (or one that lands in a table gap) returns `undefined`. Rows
 * are assumed sorted ascending by their range start.
 *
 * Use this when rows key their bounds under a field other than `range`
 * (e.g. `roll`, `{rangeMin, rangeMax}`) — pass an accessor returning the
 * inclusive `[low, high]` tuple. {@link findBand} is the shorthand for rows that
 * already expose `range`.
 */
export function findBandBy<T>(rows: readonly T[], roll: number, range: (row: T) => readonly [number, number], options?: { clamp?: boolean }): T | undefined {
    const hit = rows.find((row) => roll >= range(row)[0] && roll <= range(row)[1]);
    if (hit !== undefined) return hit;
    if (options?.clamp === false) return undefined;
    const first = rows[0];
    const last = rows[rows.length - 1];
    // first/last are defined whenever rows is non-empty, but noUncheckedIndexedAccess
    // (main tsconfig) types indexed access as T | undefined and requires this guard.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has the flag off, tsc (flag on) requires this guard
    if (first === undefined || last === undefined) return undefined;
    if (roll < range(first)[0]) return first;
    if (roll > range(last)[1]) return last;
    return undefined;
}

/**
 * Find the row whose inclusive `[low, high]` `range` contains `roll`. Shorthand
 * for {@link findBandBy} over rows that expose a `range` tuple directly; see that
 * function for the clamp semantics.
 */
export function findBand<T extends BandRow>(rows: readonly T[], roll: number, options?: { clamp?: boolean }): T | undefined {
    return findBandBy(rows, roll, (row) => row.range, options);
}

/**
 * Clamp a raw roll value to an inclusive integer band (default `[1, 100]` —
 * a legal d100). The value is truncated toward zero, then clamped to
 * `[min, max]`. Non-finite input is left to propagate through the clamp
 * (`NaN` stays `NaN`) unless `nonFinite` is supplied, in which case a non-finite
 * input returns that fallback — matching the two re-derived shapes in the rules
 * layer (the bare `Math.max(min, Math.min(max, Math.trunc(roll)))` form vs. the
 * Navigator form that floors a non-finite roll to its minimum).
 */
export function clampRoll(roll: number, options?: { min?: number; max?: number; nonFinite?: number }): number {
    if (options?.nonFinite !== undefined && !Number.isFinite(roll)) return options.nonFinite;
    const min = options?.min ?? 1;
    const max = options?.max ?? 100;
    return Math.max(min, Math.min(max, Math.trunc(roll)));
}

/**
 * Roll a single die of `faces` sides (1–`faces`) using the injected `Rng`.
 * The generator's output is coerced to a finite float and clamped to
 * `[0, 0.9999999]` first, so a stray `1` (or `NaN` / out-of-range value) can
 * never produce `faces + 1`. Pure given a seeded generator.
 */
export function rollDie(faces: number, rng: Rng): number {
    const raw = Number(rng());
    const r = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
    return Math.floor(r * faces) + 1;
}

/** Roll a d100 (1–100) using the injected `Rng`. */
export function rollD100(rng: Rng): number {
    return rollDie(100, rng);
}
