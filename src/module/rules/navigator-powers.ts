/**
 * Navigator Powers — RT-only engine (#194 — Rogue Trader core.md
 * §"Using Navigator Powers", L8358–L8466).
 *
 * Rules-as-written shape (engine only — per-power content lives in the
 * `rt-*-items-navigator-powers` compendium packs):
 *
 *   1. **Level / mastery bonus.** A Navigator's mastery of a power runs
 *      Novice → Adept → Master, applying a +0 / +10 / +20 modifier to
 *      the underlying characteristic test (core.md L8366–L8370).
 *   2. **Test characteristic.** Each power names the characteristic
 *      tested (Perception or Willpower for almost every entry in the
 *      core list); the engine accepts the chosen characteristic value
 *      from the actor and only owns the target-number math.
 *   3. **Difficulty modifier.** Some power descriptions name a
 *      difficulty: Lidless Stare is a Full Action with no fixed
 *      difficulty (the resolver treats this as Challenging / +0), The
 *      Course Untravelled is Difficult (−10) at Novice and Challenging
 *      (+0) at Adept, etc. The caller passes the difficulty modifier
 *      sourced from the compendium document (Direction #7); the engine
 *      sums it in.
 *   4. **Opposed branch.** Several powers (Held in my Gaze, The Lidless
 *      Stare) are Opposed Tests. Per core.md L7505–L7520 ("If the Focus
 *      Power Test is an Opposed Test, the Psyker must successfully pass
 *      the Test and gain more successes than at least one of his
 *      opponents to activate the Technique") the resolver requires BOTH
 *      sides to pass AND the Navigator to beat the opponent's net DoS;
 *      ties favour the target (core convention for opposed tests).
 *   5. **Effect tier.** On a pass, the engine surfaces which of
 *      novice / adept / master effect text applies — always the power's
 *      *bonded* level, not "higher levels lock out lower text".
 *      Master powers retain the Novice and Adept effects (they are
 *      additive in the RAW), so the engine returns the active level and
 *      a frozen list of every effect tier the Navigator may invoke.
 *   6. **Sustain.** Some powers have a `sustain` clause ("This power
 *      will last as long as the Navigator maintains it"). The engine
 *      reports whether sustain is applicable; the chat card surfaces it
 *      so the GM can flag the maintain-cost on subsequent rounds.
 *
 * This module is pure logic — no Foundry imports, no RNG. Callers
 * pre-roll d100s and pass them in. The RT-gating is the caller's job
 * (Document layer in `documents/item.ts`).
 */

/**
 * Three canonical Navigator-power mastery tiers (core.md L8366–L8370).
 * Stored on the compendium document under `system.levels.<tier>`.
 */
export type NavigatorPowerLevel = 'novice' | 'adept' | 'master';

/** Tier-specific bonus to the underlying characteristic test, per RAW. */
export const NAVIGATOR_LEVEL_BONUS: Readonly<Record<NavigatorPowerLevel, number>> = Object.freeze({
    novice: 0,
    adept: 10,
    master: 20,
});

/** Canonical ordering Novice → Adept → Master. */
export const NAVIGATOR_LEVEL_ORDER: ReadonlyArray<NavigatorPowerLevel> = Object.freeze(['novice', 'adept', 'master']);

/**
 * Inputs for a non-opposed Navigator-power test.
 * - `characteristic` — Navigator's tested characteristic value (e.g. WP).
 * - `level` — chosen mastery tier (drives the +0/+10/+20 modifier).
 * - `difficultyModifier` — power-specific difficulty from the compendium
 *    (e.g. -10 for "Difficult" Course Untravelled / Novice).
 * - `situationalModifier` — extra GM modifier (defaults to 0).
 * - `roll` — pre-rolled d100 result (1..100).
 */
export interface NavigatorTestInput {
    readonly characteristic: number;
    readonly level: NavigatorPowerLevel;
    readonly difficultyModifier?: number;
    readonly situationalModifier?: number;
    readonly roll: number;
}

/**
 * Result of resolving a non-opposed Navigator-power test.
 */
export interface NavigatorTestResult {
    readonly target: number;
    readonly roll: number;
    readonly levelBonus: number;
    readonly success: boolean;
    /** Degrees of Success on a pass (0 on a fail). */
    readonly dos: number;
    /** Degrees of Failure on a fail (0 on a pass). */
    readonly dof: number;
    /** The chosen mastery tier (echoed back for chat-card rendering). */
    readonly level: NavigatorPowerLevel;
}

/**
 * Inputs for an opposed Navigator-power test (Held in my Gaze, The
 * Lidless Stare). Both sides pre-roll their d100.
 */
export interface NavigatorOpposedInput {
    readonly navigator: NavigatorTestInput;
    readonly opponent: {
        readonly characteristic: number;
        readonly difficultyModifier?: number;
        readonly situationalModifier?: number;
        readonly roll: number;
    };
}

/**
 * Result of an opposed Navigator-power test.
 * Per core.md L7505–L7520: the Navigator must pass AND outscore the
 * opponent in DoS to manifest the power; tie or higher DoS for the
 * opponent → the Navigator fails to manifest.
 */
export interface NavigatorOpposedResult {
    readonly navigator: NavigatorTestResult;
    readonly opponent: NavigatorTestResult;
    /** Final manifestation outcome (after the opposed comparison). */
    readonly success: boolean;
    /** Navigator DoS minus opponent DoS (signed). 0 on a tie. */
    readonly netDos: number;
}

/**
 * Compute the target number for a Navigator-power test.
 *
 * `target = characteristic + levelBonus + difficultyModifier + situationalModifier`
 *
 * Clamped to `[0, 100]` so a deeply-modified test still has a defined
 * pass/fail boundary against a d100 (core.md does not codify a ceiling
 * directly but a target >100 is degenerate — every roll passes — and a
 * target <0 is unmakeable).
 */
export function navigatorPowerTarget(input: Omit<NavigatorTestInput, 'roll'>): number {
    const bonus = NAVIGATOR_LEVEL_BONUS[input.level];
    const raw = input.characteristic + bonus + (input.difficultyModifier ?? 0) + (input.situationalModifier ?? 0);
    return clampTarget(raw);
}

/**
 * Resolve a non-opposed Navigator-power test against a target number.
 * Pure: caller pre-rolls the d100.
 *
 * RAW DoS / DoF math (core.md §"Degrees of Success"): full tens of the
 * gap, +1 (a bare pass is 1 DoS; a bare fail is 1 DoF).
 */
export function resolveNavigatorPower(input: NavigatorTestInput): NavigatorTestResult {
    const levelBonus = NAVIGATOR_LEVEL_BONUS[input.level];
    const target = navigatorPowerTarget(input);
    const roll = clampRoll(input.roll);
    const success = roll <= target;
    const dos = success ? Math.floor((target - roll) / 10) + 1 : 0;
    const dof = success ? 0 : Math.floor((roll - target - 1) / 10) + 1;
    return Object.freeze({
        target,
        roll,
        levelBonus,
        success,
        dos,
        dof,
        level: input.level,
    });
}

/**
 * Resolve an opposed Navigator-power test (e.g. Held in my Gaze).
 * Pure: caller pre-rolls both d100s.
 *
 * Manifestation rule: the Navigator must pass their own test AND end up
 * with strictly more DoS than the opponent. Ties favour the target —
 * the Navigator does not manifest.
 */
export function resolveOpposedNavigatorPower(input: NavigatorOpposedInput): NavigatorOpposedResult {
    const navResult = resolveNavigatorPower(input.navigator);
    const opponentTarget = clampTarget(input.opponent.characteristic + (input.opponent.difficultyModifier ?? 0) + (input.opponent.situationalModifier ?? 0));
    const opponentRoll = clampRoll(input.opponent.roll);
    const opponentSuccess = opponentRoll <= opponentTarget;
    const opponentDos = opponentSuccess ? Math.floor((opponentTarget - opponentRoll) / 10) + 1 : 0;
    const opponentDof = opponentSuccess ? 0 : Math.floor((opponentRoll - opponentTarget - 1) / 10) + 1;
    const opponent: NavigatorTestResult = Object.freeze({
        target: opponentTarget,
        roll: opponentRoll,
        levelBonus: 0,
        success: opponentSuccess,
        dos: opponentDos,
        dof: opponentDof,
        // The opponent has no Navigator level; we echo Novice purely so
        // the shape stays uniform for chat-card rendering.
        level: 'novice',
    });

    const netDos = navResult.dos - opponent.dos;
    // Pass + strictly beat the opponent's DoS → manifest. The RAW
    // convention for an opposed test is that the *active* side must win
    // outright; a tie means the target resists.
    const success = navResult.success && netDos > 0;
    return Object.freeze({
        navigator: navResult,
        opponent,
        success,
        netDos,
    });
}

/**
 * Compendium-supplied effect payload, mirroring `NavigatorPowerData`'s
 * `levels` schema. The engine takes the parsed payload — it does not
 * hard-code the per-power text (Direction #7).
 */
export interface NavigatorPowerLevels {
    readonly novice?: { readonly effect?: string };
    readonly adept?: { readonly effect?: string };
    readonly master?: { readonly effect?: string };
}

/**
 * Build the list of effect-tier strings that apply at the chosen
 * mastery level. RAW: Master text reads "As above…" — so the effects
 * are additive. The engine returns the active level *and* every lower
 * tier's text so the chat card renders the full power, not a slice.
 */
export interface NavigatorPowerEffectTier {
    readonly level: NavigatorPowerLevel;
    readonly effect: string;
}

export function emitNavigatorPowerEffects(levels: NavigatorPowerLevels, activeLevel: NavigatorPowerLevel): NavigatorPowerEffectTier[] {
    const out: NavigatorPowerEffectTier[] = [];
    for (const tier of NAVIGATOR_LEVEL_ORDER) {
        const text = levels[tier]?.effect ?? '';
        if (text.length > 0) {
            out.push({ level: tier, effect: text });
        }
        if (tier === activeLevel) break;
    }
    return out;
}

/**
 * Returns `true` when `level` is a recognised mastery tier. Used by the
 * Document layer to defensively coerce user-supplied input (`'master'`
 * arriving from a dialog) before calling the resolvers.
 */
export function isNavigatorPowerLevel(value: unknown): value is NavigatorPowerLevel {
    return value === 'novice' || value === 'adept' || value === 'master';
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function clampTarget(raw: number): number {
    if (!Number.isFinite(raw)) return 0;
    if (raw < 0) return 0;
    if (raw > 100) return 100;
    return Math.trunc(raw);
}

function clampRoll(raw: number): number {
    if (!Number.isFinite(raw)) return 1;
    if (raw < 1) return 1;
    if (raw > 100) return 100;
    return Math.trunc(raw);
}
