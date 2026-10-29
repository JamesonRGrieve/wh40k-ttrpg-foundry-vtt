/**
 * Environmental hazard resolvers — Falling and Suffocation (#118).
 *
 * The six FFG lines share one falling rule and one suffocation rule with a few
 * printed divergences, recorded per line in {@link HAZARD_RULES}:
 *
 * - **Falling.** 1d10 Impact damage plus 1 per metre fallen, to a random hit
 *   location, ignoring Armour (but not Toughness), in DH2, RT, DW, BC and OW.
 *   DH1 uses a distance table instead.
 * - **Suffocation.** Air lasts TB minutes for a resting character and 2 × TB
 *   rounds for an active one, with a Challenging (+0) Toughness test each minute
 *   (or round) that costs a level of Fatigue on a failure. When it runs out the
 *   character goes Unconscious, then dies after TB rounds (DH2, BC, OW) or takes
 *   1d10 damage a round, ignoring Armour and Toughness, until dead (DH1, RT, DW).
 *   DH1 has only
 *   the conserving-oxygen allotment. Drowning is a form of suffocation in every
 *   line — there is no separate drowning rule.
 *
 * Imperium Maledictum runs a different engine (falling inflicts a Critical Hit,
 * breath is held for TB × 10 seconds); it is explicitly unsupported here and the
 * hazard dialog says so rather than applying an FFG rule to it.
 *
 * Pure: the GM hazard dialog (`applications/prompts/hazard-dialog.ts`) rolls the
 * formulas, picks the location and posts the chat cards.
 */

import type { GameSystemId } from '../config/game-systems/types.ts';
import { nonNegInt } from './_num.ts';

/** Falling damage is Impact damage in every line (for Critical Effects). */
export const FALLING_DAMAGE_TYPE = 'Impact';

/** Armour offers no protection against a fall in every line. */
export const FALLING_IGNORES_ARMOUR = true;

/** The base die every line rolls for a fall. */
const FALLING_BASE_DIE = '1d10';

/** One row of DH1's Table 7-27: a fall of at least `minMetres` deals 1d10 + `bonus`. */
interface FallingBracket {
    minMetres: number;
    bonus: number;
}

type FallingRule = { kind: 'perMetre' } | { kind: 'table'; brackets: readonly FallingBracket[] };

/** What happens to an Unconscious character still deprived of oxygen. */
export type SuffocationEndgame = 'diesAfterTbRounds' | 'damagePerRound';

interface SuffocationRule {
    /** Whether the line prints the strenuous-activity (2 × TB rounds) allotment. */
    strenuousAllotment: boolean;
    endgame: SuffocationEndgame;
}

export interface HazardLineRules {
    falling: FallingRule;
    suffocation: SuffocationRule;
}

/** DH1 Core p. 210, Table 7-27: Falling Damage (ascending by distance). */
const DH1_FALLING_TABLE: readonly FallingBracket[] = [
    { minMetres: 3, bonus: 3 },
    { minMetres: 6, bonus: 5 },
    { minMetres: 9, bonus: 7 },
    { minMetres: 12, bonus: 9 },
    { minMetres: 15, bonus: 11 },
    { minMetres: 18, bonus: 13 },
    { minMetres: 21, bonus: 15 },
    { minMetres: 24, bonus: 17 },
    { minMetres: 25, bonus: 20 },
];

const PER_METRE: FallingRule = { kind: 'perMetre' };

/** The printed falling / suffocation rules of each line; `null` = not modelled (IM). */
export const HAZARD_RULES: Readonly<Record<GameSystemId, HazardLineRules | null>> = {
    dh1: { falling: { kind: 'table', brackets: DH1_FALLING_TABLE }, suffocation: { strenuousAllotment: false, endgame: 'damagePerRound' } },
    dh2: { falling: PER_METRE, suffocation: { strenuousAllotment: true, endgame: 'diesAfterTbRounds' } },
    rt: { falling: PER_METRE, suffocation: { strenuousAllotment: true, endgame: 'damagePerRound' } },
    dw: { falling: PER_METRE, suffocation: { strenuousAllotment: true, endgame: 'damagePerRound' } },
    bc: { falling: PER_METRE, suffocation: { strenuousAllotment: true, endgame: 'diesAfterTbRounds' } },
    ow: { falling: PER_METRE, suffocation: { strenuousAllotment: true, endgame: 'diesAfterTbRounds' } },
    im: null,
};

/** The hazard rules for a line, or null when the line is not modelled. */
function hazardRulesFor(line: GameSystemId): HazardLineRules | null {
    return HAZARD_RULES[line];
}

/* -------------------------------------------- */
/*  Falling                                     */
/* -------------------------------------------- */

/** How a line derives the flat bonus added to the falling die; null when not modelled. */
export function fallingRuleKind(line: GameSystemId): FallingRule['kind'] | null {
    return hazardRulesFor(line)?.falling.kind ?? null;
}

/**
 * The flat bonus added to the 1d10 for a fall of `metres` (truncated to whole
 * metres). Returns null when the fall deals no damage — a zero-metre fall, a DH1
 * fall shorter than the table's first row — or the line is not modelled.
 */
export function getFallingDamageBonus(metres: number, line: GameSystemId): number | null {
    const rules = hazardRulesFor(line);
    if (rules === null) return null;
    const distance = nonNegInt(metres);
    if (distance === 0) return null;
    if (rules.falling.kind === 'perMetre') return distance;
    let bonus: number | null = null;
    for (const bracket of rules.falling.brackets) {
        if (distance >= bracket.minMetres) bonus = bracket.bonus;
    }
    return bonus;
}

/** The falling-damage dice formula for a fall of `metres`; `''` when it deals no damage. */
export function getFallingDamageFormula(metres: number, line: GameSystemId): string {
    const bonus = getFallingDamageBonus(metres, line);
    return bonus === null ? '' : `${FALLING_BASE_DIE}+${bonus}`;
}

/* -------------------------------------------- */
/*  Suffocation                                 */
/* -------------------------------------------- */

/** Difficulty of the per-interval Toughness test (Challenging, +0) in every line. */
export const SUFFOCATION_TEST_DIFFICULTY = 0;

/** Fatigue levels a failed per-interval Toughness test inflicts. */
export const SUFFOCATION_FATIGUE_PER_FAILURE = 1;

/** Damage formula of the `damagePerRound` endgame (ignores Armour and Toughness). */
export const SUFFOCATION_ENDGAME_DAMAGE = '1d10';

export type BreathUnit = 'minute' | 'round';

interface BreathAllotment {
    /** Minutes or rounds the character can hold his breath. */
    count: number;
    /** The interval of both the allotment and the Toughness test. */
    unit: BreathUnit;
    /** True when strenuous activity was requested but the line prints no such allotment (DH1). */
    strenuousUnsupported: boolean;
}

export interface SuffocationOutcome {
    allotment: BreathAllotment;
    endgame: SuffocationEndgame;
    /** Rounds an Unconscious, oxygen-deprived character survives (`diesAfterTbRounds`); 0 otherwise. */
    roundsUntilDeath: number;
}

/**
 * Resolve a character's suffocation track from his Toughness Bonus and activity.
 * Returns null when the line is not modelled.
 */
export function resolveSuffocation(input: { toughnessBonus: number; strenuous: boolean; line: GameSystemId }): SuffocationOutcome | null {
    const rules = hazardRulesFor(input.line);
    if (rules === null) return null;
    const tb = nonNegInt(input.toughnessBonus);
    const strenuous = input.strenuous && rules.suffocation.strenuousAllotment;
    const allotment: BreathAllotment = strenuous
        ? { count: tb * 2, unit: 'round', strenuousUnsupported: false }
        : { count: tb, unit: 'minute', strenuousUnsupported: input.strenuous && !rules.suffocation.strenuousAllotment };
    const endgame = rules.suffocation.endgame;
    return { allotment, endgame, roundsUntilDeath: endgame === 'diesAfterTbRounds' ? tb : 0 };
}
