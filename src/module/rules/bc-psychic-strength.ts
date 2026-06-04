/**
 * Black Crusade Psychic Strength RAW resolver (#178 — core.md Table 6-1
 * "Psy Rating", p.9466, and §"Manifesting a Power", p.9486-9530).
 *
 * Pure functions over a Heretic psyker's Psy Rating (PR), push level,
 * and sustained-power burden. The caller (sheet, chat card, psychic
 * test dialog) owns I/O and actor lookups; this module owns the
 * push-ceiling table, the fettered/unfettered/push arithmetic, the
 * sustain penalty, and the per-mode phenomena-roll counts.
 *
 * Canonical rules referenced here:
 *   - Psyker Class (Table 6-1): Bound (+3 push), Unbound (+5 push), and
 *     Daemonic (+4 push). Each class caps how many additional points of
 *     PR a psyker may add when Pushing.
 *   - Fettered (core.md :9486): half PR rounded down, no Psychic
 *     Phenomena roll on a successful test.
 *   - Unfettered (core.md :9499): full PR, one Psychic Phenomena roll
 *     on a successful test as RAW.
 *   - Push (core.md :9513-9530): PR + chosen push level (clamped to the
 *     class ceiling), plus one Phenomena roll PER push level on a
 *     successful test (i.e. base unfettered roll + push-level extras).
 *   - Sustain (core.md :9544): each power sustained beyond the first
 *     applies a -10 to ALL related psychic tests and adds one extra
 *     Phenomena roll per excess power. The first sustain is "free"
 *     (penalty / phenomena floor at 0).
 *
 * No DataModel coupling, no actor lookups, no Foundry imports.
 */

import { nonNegInt } from './_num.ts';

/** Psyker class identifiers from BC Table 6-1. */
export type PsykerClass = 'bound' | 'unbound' | 'daemonic';

/** Manifestation mode chosen by the psyker before rolling. */
export type PsyMode = 'fettered' | 'unfettered' | 'push';

/**
 * BC Table 6-1 — maximum additional PR a psyker of each class may add
 * when Pushing. The chosen push level is clamped to this ceiling
 * before being added to base PR in {@link effectivePsyRating}.
 */
export const BC_PSYKER_PUSH_CEILING: Record<PsykerClass, number> = {
    bound: 3,
    unbound: 5,
    daemonic: 4,
};

/**
 * Per-power Sustain penalty. RAW: "-10 to all related psychic tests"
 * for EACH additional power being sustained beyond the first. The
 * first sustained power contributes no penalty.
 */
export const BC_PSY_SUSTAIN_PENALTY_PER_POWER = -10;

/* -------------------------------------------- */
/*  Push ceiling                                */
/* -------------------------------------------- */

/**
 * Maximum push level for a given psyker class.
 *
 * @param psykerClass One of `'bound' | 'unbound' | 'daemonic'`.
 * @returns The ceiling from {@link BC_PSYKER_PUSH_CEILING}.
 */
export function maxPushLevel(psykerClass: PsykerClass): number {
    return BC_PSYKER_PUSH_CEILING[psykerClass];
}

/* -------------------------------------------- */
/*  Effective Psy Rating                        */
/* -------------------------------------------- */

/** Input shape for {@link effectivePsyRating}. */
export interface EffectivePsyRatingArgs {
    /** Manifestation mode for this attempt. */
    mode: PsyMode;
    /** Base Psy Rating from the actor's profile. */
    basePR: number;
    /** Chosen push level (only consulted when `mode === 'push'`). */
    pushLevel: number;
    /** Psyker class — drives the push ceiling. */
    psykerClass: PsykerClass;
}

/**
 * Resolve the effective PR used to manifest a power.
 *
 * - Fettered: `floor(basePR / 2)`, no phenomena (handled in
 *   {@link phenomenaRollCount}).
 * - Unfettered: `basePR`.
 * - Push: `basePR + min(pushLevel, maxPushLevel(psykerClass))`.
 *
 * Non-finite or negative inputs are sanitised to 0. Push levels are
 * clamped to the class ceiling (RAW does not allow exceeding it).
 */
export function effectivePsyRating(args: EffectivePsyRatingArgs): number {
    const base = nonNegInt(args.basePR);
    if (args.mode === 'fettered') return Math.floor(base / 2);
    if (args.mode === 'unfettered') return base;
    // push
    const requested = nonNegInt(args.pushLevel);
    const ceiling = maxPushLevel(args.psykerClass);
    return base + Math.min(requested, ceiling);
}

/* -------------------------------------------- */
/*  Sustain penalty                             */
/* -------------------------------------------- */

/**
 * RAW Sustain penalty: each power being sustained beyond the first
 * applies an additional -10 to all related psychic tests. With 0 or 1
 * powers sustained the penalty is 0; with 2 it is -10; with 3 it is
 * -20; etc.
 *
 * @param sustainedPowerCount Total powers currently being sustained
 *   (including the one being tested for, if applicable).
 * @returns The cumulative penalty (≤ 0).
 */
export function sustainPenalty(sustainedPowerCount: number): number {
    const count = nonNegInt(sustainedPowerCount);
    const excess = Math.max(0, count - 1);
    if (excess === 0) return 0;
    return excess * BC_PSY_SUSTAIN_PENALTY_PER_POWER;
}

/* -------------------------------------------- */
/*  Phenomena roll count                        */
/* -------------------------------------------- */

/** Input shape for {@link phenomenaRollCount}. */
export interface PhenomenaRollCountArgs {
    /** Manifestation mode for this attempt. */
    mode: PsyMode;
    /** Chosen push level (only consulted when `mode === 'push'`). */
    pushLevel: number;
}

/**
 * Number of Psychic Phenomena rolls a successful manifestation
 * triggers:
 *   - Fettered: 0 (RAW — no phenomena on Fettered casts).
 *   - Unfettered: 1.
 *   - Push: `1 + pushLevel` (the base unfettered roll plus one extra
 *     per point of push). Push level is sanitised to a non-negative
 *     integer but is NOT clamped to the class ceiling here — the
 *     caller is expected to have clamped it via
 *     {@link effectivePsyRating} (or to be asking about a hypothetical
 *     un-clamped push for UI display). If you want the ceiling-clamped
 *     count, pass the clamped push level in.
 */
export function phenomenaRollCount(args: PhenomenaRollCountArgs): number {
    if (args.mode === 'fettered') return 0;
    if (args.mode === 'push') {
        const level = nonNegInt(args.pushLevel);
        return 1 + level;
    }
    return 1;
}

/* -------------------------------------------- */
/*  Composed resolver                           */
/* -------------------------------------------- */

/** Input shape for {@link resolvePsychicTest}. */
export interface PsychicTestInput {
    /** Psyker class — drives the push ceiling. */
    psykerClass: PsykerClass;
    /** Manifestation mode chosen for this attempt. */
    mode: PsyMode;
    /** Base Psy Rating from the actor's profile. */
    basePR: number;
    /** Chosen push level (only consulted when `mode === 'push'`). */
    pushLevel: number;
    /** Total powers currently being sustained. */
    sustainedPowerCount: number;
}

/** Result shape returned by {@link resolvePsychicTest}. */
export interface PsychicTestResolution {
    /** Effective PR used for the test (post fettered/push arithmetic). */
    effectivePR: number;
    /** Penalty applied to the focus power test (≤ 0). */
    sustainPenalty: number;
    /** Number of Psychic Phenomena rolls to make on a successful manifest. */
    phenomenaRolls: number;
}

/**
 * Compose {@link effectivePsyRating}, {@link sustainPenalty}, and
 * {@link phenomenaRollCount} into a single resolution suitable for a
 * chat-card or dialog summary. The phenomena count is computed against
 * the class-clamped push level so the displayed value matches the PR
 * that will actually be rolled.
 */
export function resolvePsychicTest(input: PsychicTestInput): PsychicTestResolution {
    const clampedPush = input.mode === 'push' ? Math.min(nonNegInt(input.pushLevel), maxPushLevel(input.psykerClass)) : 0;
    const effectivePR = effectivePsyRating({
        mode: input.mode,
        basePR: input.basePR,
        pushLevel: input.pushLevel,
        psykerClass: input.psykerClass,
    });
    return {
        effectivePR,
        sustainPenalty: sustainPenalty(input.sustainedPowerCount),
        phenomenaRolls: phenomenaRollCount({ mode: input.mode, pushLevel: clampedPush }),
    };
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */
