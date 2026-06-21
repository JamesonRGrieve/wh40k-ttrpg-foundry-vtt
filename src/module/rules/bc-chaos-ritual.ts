/**
 * Black Crusade Chaos Ritual engine (#179 — core.md §"Chaos Ritual
 * Template" :11081, Table 6-7 "Ritual Modifiers" :11062,
 * §"Contempt of the Warp" :10992, §"Daemonic Mastery" / §"Breaking
 * Mastery" :11095-11103).
 *
 * Pure rules / math layer for Heretics performing Chaos Rituals.
 *
 * RAW reference points encoded here:
 *   - Every ritual is authored against a six-slot template (Description,
 *     Requirements, Effects, Duration, Cost, Price of Failure). The
 *     template carries a base d100 target the ritualist must roll
 *     under to succeed.
 *   - Table 6-7 collects the standard modifiers a ritualist can stack
 *     onto the target — Cult Affiliation, Sacrifice, Sanctified
 *     Ground, Component Reagent, and Daemonic Mastery — each with a
 *     RAW numeric delta. A free-form `gm-other` slot is supplied for
 *     situational adjustments the GM applies on top.
 *   - Contempt of the Warp resolves the actual ritual roll: a d100 is
 *     compared against `(baseTarget + modifiers)`. Roll under or equal
 *     succeeds; one Degree of Success / Failure per 10-point margin
 *     in the standard BC fashion.
 *   - Breaking Mastery is the opposed Daemonic-Mastery contest used
 *     when one Heretic attempts to shatter another's binding on a
 *     daemon. The ritualist with the higher Mastery wins; the
 *     differential drives the narrative outcome upstream.
 *
 * Per Direction #7 this module holds only content-agnostic primitives:
 * the modifier-kind enum, the breakdown shape, the target-composition
 * arithmetic, and the resolver math. Concrete ritual catalogues, per-
 * ritual targets, and per-cult/component RAW deltas live in compendium
 * `_source/` documents and are surfaced to this engine via structured
 * fields on the consuming DataModel.
 *
 * RNG-free and actor-decoupled; no I/O, no Foundry Document reads.
 */

import { degreesOfFailure, degreesOfSuccess } from './_dice.ts';

/* -------------------------------------------------------------------- */
/*  Modifier registry — Table 6-7                                       */
/* -------------------------------------------------------------------- */

/**
 * Discriminator for a ritual modifier stacked onto the base target.
 *
 * The six canonical kinds correspond to Table 6-7's rows; `gm-other`
 * is the catch-all slot for situational adjustments the GM applies
 * outside the table (e.g. astrological alignment, narrative flourish).
 */
export type RitualModifierKind = 'cult-affiliation' | 'sacrifice' | 'sanctified-ground' | 'component-reagent' | 'daemonic-mastery' | 'gm-other';

/**
 * A single stacked modifier. `value` is the signed delta applied to the
 * base d100 target (positive eases the test, negative penalises it,
 * matching BC's "roll under" convention).
 */
export interface RitualModifier {
    readonly kind: RitualModifierKind;
    readonly value: number;
    readonly description?: string;
}

/* -------------------------------------------------------------------- */
/*  Ritual template (six-slot canonical shape)                          */
/* -------------------------------------------------------------------- */

/**
 * Six-slot authoring template per core.md §"Chaos Ritual Template"
 * :11081. The five descriptive slots are surfaced verbatim to the UI;
 * `baseTarget` is the d100 the ritualist rolls under before any
 * Table 6-7 modifiers stack on top.
 *
 * Concrete rituals live in compendium documents shaped like this
 * interface (extended with their UUID and any per-ritual mechanical
 * sub-fields); the engine is template-shape-only.
 */
export interface RitualTemplate {
    readonly id: string;
    readonly description: string;
    readonly requirements: string;
    readonly effects: string;
    readonly duration: string;
    readonly cost: string;
    readonly priceOfFailure: string;
    /**
     * Base d100 target — RAW per-ritual difficulty before Table 6-7
     * modifiers stack on top. Must be a finite integer; the caller is
     * responsible for sourcing this value from the ritual's compendium
     * document, not for synthesising it here.
     */
    readonly baseTarget: number;
}

/* -------------------------------------------------------------------- */
/*  Target composition                                                  */
/* -------------------------------------------------------------------- */

export interface ComputeRitualTargetInput {
    readonly template: RitualTemplate;
    readonly modifiers: readonly RitualModifier[];
}

export interface ComputeRitualTargetResult {
    /** Final d100 target — baseTarget + sum(modifiers), clamped to 0. */
    readonly target: number;
    /**
     * Modifiers actually contributing to the final target, in the order
     * supplied. Returned as a fresh array so the caller can mutate
     * without aliasing the input.
     */
    readonly breakdown: readonly RitualModifier[];
}

/**
 * Compose the d100 target a Heretic must roll under to complete a
 * Chaos Ritual. The `breakdown` array enumerates every contributing
 * modifier so chat-card UIs can render them transparently.
 */
export function computeRitualTarget(input: ComputeRitualTargetInput): ComputeRitualTargetResult {
    const base = Math.trunc(input.template.baseTarget);
    const breakdown: RitualModifier[] = input.modifiers.map((m) => ({
        kind: m.kind,
        value: Math.trunc(m.value),
        ...(m.description === undefined ? {} : { description: m.description }),
    }));
    const sum = breakdown.reduce((acc, m) => acc + m.value, 0);
    const target = Math.max(0, base + sum);
    return { target, breakdown };
}

/* -------------------------------------------------------------------- */
/*  Contempt of the Warp — ritual roll resolution                       */
/* -------------------------------------------------------------------- */

export interface ContemptOfTheWarpInput {
    readonly target: number;
    readonly roll: number;
}

export interface ContemptOfTheWarpResult {
    readonly success: boolean;
    /** Degrees of Success — `floor((target - roll) / 10)`, clamped >= 0. Zero on a marginal success. */
    readonly degreesOfSuccess: number;
    /** Degrees of Failure — `floor((roll - target) / 10)`, clamped >= 0. Zero on a marginal failure. */
    readonly degreesOfFailure: number;
}

/**
 * Resolve a Contempt of the Warp test (core.md :10992) against a
 * Table 6-7-composed target. BC d100 convention is roll-under-or-equal:
 * `roll <= target` succeeds, one DoS / DoF per full 10-point margin.
 */
export function resolveContemptOfTheWarp(input: ContemptOfTheWarpInput): ContemptOfTheWarpResult {
    const target = Math.trunc(input.target);
    const roll = Math.trunc(input.roll);
    // BC rituals use the "extra degrees" convention — a bare success scores 0
    // and each full ten of margin adds one — so route through the shared
    // primitives with `extra: true`.
    return {
        success: roll <= target,
        degreesOfSuccess: degreesOfSuccess(roll, target, { extra: true }),
        degreesOfFailure: degreesOfFailure(roll, target, { extra: true }),
    };
}

/* -------------------------------------------------------------------- */
/*  Breaking Mastery — opposed Daemonic Mastery contest                 */
/* -------------------------------------------------------------------- */

export interface BreakingMasteryInput {
    /** Mastery Rating of the Heretic attempting to break an existing binding. */
    readonly rollerMasteryRating: number;
    /** Mastery Rating of the Heretic whose binding is under attack. */
    readonly opponentMasteryRating: number;
}

export interface BreakingMasteryResult {
    /** True when the binding is shattered (roller's Mastery exceeds opponent's). */
    readonly broken: boolean;
    /** Signed differential = roller - opponent. Positive favours the roller. */
    readonly differential: number;
}

/**
 * Resolve a Breaking Mastery contest (core.md :11095-11103). The
 * higher-Mastery side wins; a tie favours the defender (the existing
 * binding holds). The signed differential is returned so callers can
 * surface the margin in narrative output.
 */
export function resolveBreakingMastery(input: BreakingMasteryInput): BreakingMasteryResult {
    const roller = Math.trunc(input.rollerMasteryRating);
    const opponent = Math.trunc(input.opponentMasteryRating);
    const differential = roller - opponent;
    return { broken: differential > 0, differential };
}
