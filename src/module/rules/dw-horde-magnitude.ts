/**
 * Deathwatch Horde / Magnitude RAW resolver (#166 — core.md p.359-360).
 *
 * Pure functions over Magnitude values. The caller (sheet, chat card,
 * AssignDamageData horde branch) owns I/O; this module owns the table
 * lookups and arithmetic.
 *
 * Canonical rules referenced here:
 *   - TABLE 13-1: Example Horde Magnitudes (size & to-hit modifier).
 *   - "Damaging a Horde": each damaging hit removes 1 Magnitude;
 *     Explosive (X) weapons count as one extra hit per hit.
 *   - "Melee": one hit per *two* DoS on the WS test; Power Field adds +1.
 *   - "Blast Weapons": Blast (X) auto-hits X times.
 *   - "Flame Weapons": hits = ceil(range / 4) + 1d5.
 *   - "Psychic Powers": hits = Psy Rating, +1d10 if area.
 *   - "Damage Caused By Hordes": +d10s per (Magnitude / 10), capped +2d10.
 *   - "Breaking a Horde": 25%-in-a-turn / 50% / 25% thresholds.
 *
 * Horde *traits* (Disciplined, Overwhelming, Fearless, …) modify these
 * results — the trait hook is exposed as a thin layer so additional
 * traits can be added without rewriting consumers.
 */

import type { HordeTrait } from '../data/actor/mixins/horde-template.ts';
// `import type` keeps this circular reference compile-only — runtime
// loading order remains rules-then-mixin, and the mixin imports value
// exports from this file. If a future change needs runtime access to
// `HordeTrait`, move the union into a leaf module instead.

/** Tier in TABLE 13-1: descriptive label + size and to-hit modifier. */
export interface HordeMagnitudeTier {
    /** Lower bound of Magnitude for this tier (inclusive). */
    minMagnitude: number;
    /** Descriptive equivalent, e.g. "A mob", "A throng". */
    descriptor: string;
    /** Size keyword applied to the horde at this tier. */
    sizeKeyword: 'Massive' | 'Immense' | 'Monumental' | 'Titanic';
    /** Bonus added to to-hit rolls against the horde (positive = easier to hit). */
    toHitBonus: 30 | 40 | 50 | 60;
}

/**
 * TABLE 13-1 — Example Horde Magnitudes. Ordered ascending; the
 * resolver picks the *highest* tier whose `minMagnitude` ≤ current
 * Magnitude. A horde at Magnitude < 30 still counts as a Mob (the RAW
 * table treats Magnitude 30 as the canonical baseline; smaller mobs
 * remain on the Massive row until they break).
 */
export const HORDE_MAGNITUDE_TIERS: readonly HordeMagnitudeTier[] = [
    { minMagnitude: 0, descriptor: 'A mob', sizeKeyword: 'Massive', toHitBonus: 30 },
    { minMagnitude: 60, descriptor: 'A thronged phalanx', sizeKeyword: 'Immense', toHitBonus: 40 },
    { minMagnitude: 90, descriptor: 'A massed assault', sizeKeyword: 'Monumental', toHitBonus: 50 },
    { minMagnitude: 120, descriptor: 'A serried tide of foes', sizeKeyword: 'Titanic', toHitBonus: 60 },
];

/** Hard cap on horde damage-bonus dice per RAW ("maximum bonus of +2d10"). */
export const HORDE_DAMAGE_BONUS_DIE_CAP = 2;

/** Resolve the active tier for a given Magnitude. */
export function getHordeTier(magnitude: number): HordeMagnitudeTier {
    // HORDE_MAGNITUDE_TIERS is a non-empty const array; index 0 is always defined.
    const baseTier = HORDE_MAGNITUDE_TIERS[0]!;
    if (!Number.isFinite(magnitude) || magnitude < 0) {
        // Fallback: a destroyed/invalid horde still resolves to the mob tier
        // so callers don't have to null-check; downstream `hordeDestroyed`
        // gating prevents rolls against it.
        return baseTier;
    }
    let active: HordeMagnitudeTier = baseTier;
    for (const tier of HORDE_MAGNITUDE_TIERS) {
        if (magnitude >= tier.minMagnitude) active = tier;
    }
    return active;
}

/** Bonus to to-hit tests fired at a horde of this Magnitude. */
export function toHitBonusForMagnitude(magnitude: number): number {
    return getHordeTier(magnitude).toHitBonus;
}

/**
 * Bonus *damage dice* added when the horde attacks (1d10 per full 10
 * Magnitude, capped at +2d10).
 */
export function bonusDamageDiceForMagnitude(magnitude: number): number {
    if (!Number.isFinite(magnitude) || magnitude <= 0) return 0;
    return Math.min(HORDE_DAMAGE_BONUS_DIE_CAP, Math.floor(magnitude / 10));
}

/**
 * RAW Magnitude loss for a single resolved hit that did damage. Each
 * damaging hit removes 1; Explosive weapons gain +1 extra ("count as
 * having inflicted one additional Hit"). Hits that did no damage
 * (`damageDealt <= 0`) cost the horde nothing.
 *
 * `power_field` melee weapons add an extra hit at the WS-DoS-to-hits
 * conversion step, not here — that's the caller's job before invoking
 * this resolver per resolved hit.
 */
export function magnitudeLossForHit(damageDealt: number, isExplosive: boolean): number {
    if (!Number.isFinite(damageDealt) || damageDealt <= 0) return 0;
    return isExplosive ? 2 : 1;
}

/**
 * Number of WS-test hits awarded against a horde in melee, given DoS
 * on the attack roll. RAW: "one hit for every two Degrees of Success".
 * Floor division: 0-1 DoS → 0 hits; 2-3 → 1; 4-5 → 2; etc.
 *
 * `powerField` melee weapons add an additional +1 hit per RAW.
 */
export function meleeHitsForDoS(degreesOfSuccess: number, powerField = false): number {
    if (!Number.isFinite(degreesOfSuccess) || degreesOfSuccess <= 0) return 0;
    const base = Math.floor(degreesOfSuccess / 2);
    return base > 0 && powerField ? base + 1 : base;
}

/** Blast (X) weapons auto-hit a horde X times when they land. */
export function blastHitsForBlastValue(blastValue: number): number {
    if (!Number.isFinite(blastValue) || blastValue <= 0) return 0;
    return Math.trunc(blastValue);
}

/**
 * Flame weapons hit a horde `ceil(range / 4) + 1d5` times. The d5 is
 * caller-rolled; this function takes the rolled d5 and returns the
 * total.
 */
export function flameHitsForRange(rangeMetres: number, rolledD5: number): number {
    if (!Number.isFinite(rangeMetres) || rangeMetres <= 0) return clampD5(rolledD5);
    return Math.ceil(rangeMetres / 4) + clampD5(rolledD5);
}

function clampD5(value: number): number {
    if (!Number.isFinite(value)) return 1;
    const v = Math.trunc(value);
    if (v < 1) return 1;
    if (v > 5) return 5;
    return v;
}

/**
 * Psychic-power hits against a horde: equal to Psy Rating, +1d10 if
 * the power is an area effect. Caller passes the rolled d10 (or 0 if
 * not an area power).
 */
export function psychicHitsForPsyRating(psyRating: number, areaD10 = 0): number {
    if (!Number.isFinite(psyRating) || psyRating <= 0) return 0;
    const base = Math.trunc(psyRating);
    if (!Number.isFinite(areaD10) || areaD10 <= 0) return base;
    return base + Math.trunc(areaD10);
}

/* -------------------------------------------- */
/*  Breaking a Horde                            */
/* -------------------------------------------- */

export type BreakOutcome = 'auto-break' | 'test-penalised' | 'test-normal' | 'no-test';

export interface BreakCheck {
    outcome: BreakOutcome;
    /** Modifier on the Willpower test (0 or -10). Always 0 for auto-break / no-test. */
    willpowerModifier: number;
    /** Whether the horde must roll Willpower at all this turn. */
    requiresTest: boolean;
    /** Auto-break flag (no test — Magnitude < 25% of starting). */
    autoBreaks: boolean;
}

/**
 * Resolve a horde's break-check state this turn. RAW thresholds:
 *   - Magnitude reduced by ≥25% *in a turn* → must test Willpower.
 *   - Magnitude < 50% of starting → test at -10.
 *   - Magnitude < 25% of starting → auto-break (no test).
 *   - Fearless horde → never tests; only wiping it out works.
 *
 * `lostThisTurn` is the Magnitude removed since the start of this turn.
 */
export function resolveBreakCheck(args: {
    startingMagnitude: number;
    currentMagnitude: number;
    lostThisTurn: number;
    isFearless: boolean;
    isDisciplined?: boolean;
}): BreakCheck {
    if (args.isFearless) {
        return { outcome: 'no-test', willpowerModifier: 0, requiresTest: false, autoBreaks: false };
    }
    const starting = Math.max(0, args.startingMagnitude);
    const current = Math.max(0, args.currentMagnitude);
    if (starting <= 0) {
        return { outcome: 'no-test', willpowerModifier: 0, requiresTest: false, autoBreaks: false };
    }
    const ratio = current / starting;
    const disciplined = args.isDisciplined === true;
    // Disciplined hordes ignore the -10 below 50% and don't auto-break below 25%.
    if (!disciplined && ratio < 0.25) {
        return { outcome: 'auto-break', willpowerModifier: 0, requiresTest: false, autoBreaks: true };
    }
    const lostFraction = starting > 0 ? args.lostThisTurn / starting : 0;
    const requiresTurnTrigger = lostFraction >= 0.25;
    if (!requiresTurnTrigger) {
        return { outcome: 'no-test', willpowerModifier: 0, requiresTest: false, autoBreaks: false };
    }
    if (!disciplined && ratio < 0.5) {
        return { outcome: 'test-penalised', willpowerModifier: -10, requiresTest: true, autoBreaks: false };
    }
    return { outcome: 'test-normal', willpowerModifier: 0, requiresTest: true, autoBreaks: false };
}

/* -------------------------------------------- */
/*  Horde-trait hooks                           */
/* -------------------------------------------- */

/**
 * Apply horde-trait modifications to a single attack's hit count and
 * Magnitude loss. Caller passes the base values and the active trait
 * set; this returns the trait-modified values plus a list of trait
 * IDs that fired (for chat-card display).
 *
 * Currently encoded:
 *   - Overwhelming: extra +1d10 damage in melee at Magnitude ≥ 20
 *     (caller-rolled; passed in via `overwhelmingD10`). Does not change
 *     hit count — just bonus damage on each hit.
 *   - Berserk Charge / Brutal Charge: +1d10 damage on the round the
 *     horde charges (caller-rolled, passed via `chargingD10`).
 *
 * Hit-count modifiers (Fire Drill, Blood Soaked Tide break override)
 * live on the break-check path rather than here.
 */
export interface HordeAttackContext {
    magnitude: number;
    isMelee: boolean;
    isCharge: boolean;
    /** Caller-rolled d10 if Overwhelming is active and we're in melee at Magnitude ≥ 20. */
    overwhelmingD10?: number;
    /** Caller-rolled d10 if a charge trait is active this round. */
    chargingD10?: number;
}

export interface HordeAttackResult {
    /** Bonus damage from horde traits beyond the base Magnitude/10 dice. */
    traitBonusDamage: number;
    /** Trait identifiers that fired (for chat-card display / i18n lookup). */
    firedTraits: HordeTrait[];
}

export function applyHordeTraits(traits: ReadonlySet<HordeTrait>, ctx: HordeAttackContext): HordeAttackResult {
    let bonus = 0;
    const fired: HordeTrait[] = [];
    if (traits.has('overwhelming') && ctx.isMelee && ctx.magnitude >= 20 && typeof ctx.overwhelmingD10 === 'number' && ctx.overwhelmingD10 > 0) {
        bonus += clampD10(ctx.overwhelmingD10);
        fired.push('overwhelming');
    }
    if (traits.has('brutal-charge') && ctx.isCharge && typeof ctx.chargingD10 === 'number' && ctx.chargingD10 > 0) {
        bonus += clampD10(ctx.chargingD10);
        fired.push('brutal-charge');
    }
    return { traitBonusDamage: bonus, firedTraits: fired };
}

function clampD10(value: number): number {
    if (!Number.isFinite(value)) return 1;
    const v = Math.trunc(value);
    if (v < 1) return 1;
    if (v > 10) return 10;
    return v;
}
