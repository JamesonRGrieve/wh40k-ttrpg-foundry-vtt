/**
 * NPC Disposition (#73), homologated across the lines through each line's
 * {@link DispositionModelDef} (`getDispositionModel()`).
 *
 * DH2: Disposition is an NPC-only characteristic on the usual 0–100 scale, and
 * most NPCs start somewhere in the middle of it. The GM may test it like any
 * characteristic. How an Interaction skill moves it is the NPC's Personality:
 * each skill has a test modifier and an effect of so many points per degree of
 * success or failure. There is no formula turning the value into a test
 * modifier; the GM weighs it into the difficulty, so the GM sets that difficulty
 * in the roll dialog.
 *
 * DH1, RT, BC, DW and OW use a seven-step table instead: Very Hard (−30)
 * through Indifferent (Challenging, +0) to Easy (+30), the step setting the base difficulty of an Interaction test.
 * A success improves the Disposition one step per degree of success (BC, OW)
 * or one step plus one per degree (DH1, RT, DW); a failure worsens it one step
 * per degree of failure.
 *
 * Pure: the line models, the clamp, the migration from the old −3..+3 field, the
 * ladder modifier and shift, and the Personality effect. The NPC DataModel owns
 * the schema; the social-skill action applies the results.
 */

import type { DispositionModelDef } from '../config/game-systems/types.ts';
import { nonNegInt } from './_num.ts';

/** The 0–100 characteristic scale (DH2 core rules). */
const CHARACTERISTIC_SCALE = { min: 0, max: 100 } as const;

/**
 * The value a DH2 NPC holds when the GM has set none: the middle of the
 * 40–60 band in which "most NPCs are indifferent toward the Acolytes".
 */
const CHARACTERISTIC_INDIFFERENT = 50;

/** The seven ladder steps: −3 (Very Hard) … 0 (Indifferent) … +3 (Easy). */
const LADDER_STEPS = { min: -3, max: 3 } as const;

/** Each ladder step is one difficulty band: ±10 on the test. */
const LADDER_STEP_MODIFIER = 10;

/** The per-line rule sets; each line's config returns one of these. */
export const DISPOSITION_MODELS = {
    characteristic: {
        model: 'characteristic',
        min: CHARACTERISTIC_SCALE.min,
        max: CHARACTERISTIC_SCALE.max,
        initial: CHARACTERISTIC_INDIFFERENT,
        stepModifier: 0,
        successBaseSteps: 0,
        testable: true,
    },
    /** DH1, RT, DW: "improves by one step, plus one step per degree of success". */
    ladderStepPlusDegrees: {
        model: 'ladder',
        min: LADDER_STEPS.min,
        max: LADDER_STEPS.max,
        initial: 0,
        stepModifier: LADDER_STEP_MODIFIER,
        successBaseSteps: 1,
        testable: false,
    },
    /** BC, OW: "improves one step per Degree of Success". */
    ladderDegrees: {
        model: 'ladder',
        min: LADDER_STEPS.min,
        max: LADDER_STEPS.max,
        initial: 0,
        stepModifier: LADDER_STEP_MODIFIER,
        successBaseSteps: 0,
        testable: false,
    },
    none: { model: 'none', min: 0, max: 0, initial: 0, stepModifier: 0, successBaseSteps: 0, testable: false },
} as const satisfies Record<string, DispositionModelDef>;

/** The roll key a Disposition test carries (its card and roll data name it by this). */
export const DISPOSITION_ROLL_KEY = 'disposition';

/** A value kept on the line's scale, fractions truncated. */
export function clampDisposition(value: number, def: DispositionModelDef): number {
    return Math.max(def.min, Math.min(def.max, Math.trunc(value)));
}

/** Whether the NPC has reached zero Disposition, where its Personality's zero-Disposition response applies (DH2). */
export function isZeroDisposition(value: number, def: DispositionModelDef): boolean {
    return def.model === 'characteristic' && clampDisposition(value, def) === 0;
}

/* -------------------------------------------- */
/*  Ladder lines                                */
/* -------------------------------------------- */

/** The Interaction-test modifier a ladder step sets (Indifferent = Challenging +0). */
export function ladderModifier(step: number, def: DispositionModelDef): number {
    if (def.model !== 'ladder') return 0;
    return clampDisposition(step, def) * def.stepModifier;
}

/** The difficulty band each ladder modifier is, for its label (WH40K.Difficulty.*). */
const LADDER_DIFFICULTY_KEYS: Readonly<Record<number, string>> = {
    30: 'WH40K.Difficulty.Easy',
    20: 'WH40K.Difficulty.Routine',
    10: 'WH40K.Difficulty.Ordinary',
    0: 'WH40K.Difficulty.Challenging',
    [-10]: 'WH40K.Difficulty.Difficult',
    [-20]: 'WH40K.Difficulty.Hard',
    [-30]: 'WH40K.Difficulty.VeryHard',
};

/** Langpack key of the difficulty a ladder step sets. */
export function ladderDifficultyKey(step: number, def: DispositionModelDef): string {
    return LADDER_DIFFICULTY_KEYS[ladderModifier(step, def)] ?? 'WH40K.Difficulty.Challenging';
}

/** Steps an Interaction test moves a ladder Disposition: up on success, down one per degree of failure. */
export function ladderShift(def: DispositionModelDef, success: boolean, dos: number, dof: number): number {
    if (def.model !== 'ladder') return 0;
    return success ? def.successBaseSteps + nonNegInt(dos) : -nonNegInt(dof);
}

/* -------------------------------------------- */
/*  Personality (DH2)                           */
/* -------------------------------------------- */

/** The Interaction skills a Personality table lists (DH2 Tables 8–5 to 8–9). */
export const PERSONALITY_SKILLS = ['charm', 'command', 'deceive', 'inquiry', 'intimidate', 'scrutiny'] as const;

export type PersonalitySkill = (typeof PERSONALITY_SKILLS)[number];

/** Whether the effect counts degrees of success, degrees of failure, or does not apply ("N/A"). */
type PersonalityBasis = '' | 'dos' | 'dof';

/** One row of an NPC's Personality, as the GM enters it from the book or designs it. */
export interface PersonalityRow {
    /** "The modifier applied to all uses of that skill on the NPC." */
    modifier: number;
    /** Disposition change per degree: a number or dice formula ("5", "-10", "1d5", "-1d5"). Blank = N/A. */
    effect: string;
    basis: PersonalityBasis;
}

/** An NPC's Personality: its name, its zero-Disposition response and a row per Interaction skill. */
export interface NpcPersonality {
    name: string;
    zeroDisposition: string;
    skills: Record<PersonalitySkill, PersonalityRow>;
}

/** An NPC's Disposition as the roll and sheet code reads it. */
export interface DispositionState {
    value: number;
    model: DispositionModelDef;
    /** The DH2 Personality; `null` on a line without one. */
    personality: NpcPersonality | null;
}

export function isPersonalitySkill(skill: string): skill is PersonalitySkill {
    return (PERSONALITY_SKILLS as readonly string[]).includes(skill);
}

/**
 * The Disposition change a test's result calls for: the row's per-degree effect
 * times the test's degrees of success (on a success) or failure (on a failure),
 * or `null` when the row's basis is not this outcome or it has no effect.
 * Returns the formula to roll once and the multiplier, so the caller can roll
 * dice effects ("+1d5 x DoS").
 */
export function personalityEffect(row: PersonalityRow, success: boolean, dos: number, dof: number): { formula: string; degrees: number } | null {
    const formula = row.effect.trim();
    if (formula === '' || row.basis === '') return null;
    if (row.basis === 'dos' && !success) return null;
    if (row.basis === 'dof' && success) return null;
    const degrees = nonNegInt(row.basis === 'dos' ? dos : dof);
    return degrees > 0 ? { formula, degrees } : null;
}

/* -------------------------------------------- */
/*  Social-skill tests                          */
/* -------------------------------------------- */

/** How an Interaction test moves the target's Disposition. */
export type DispositionShift =
    /** Ladder steps (signed). */
    | { kind: 'steps'; steps: number }
    /** A Personality effect: roll `formula` once and multiply by `degrees`. */
    | { kind: 'personality'; formula: string; degrees: number }
    /** No rule moves it: the GM adjudicates. */
    | { kind: 'none' };

/** An Interaction test's result. */
export interface InteractionOutcome {
    success: boolean;
    dos: number;
    dof: number;
}

/**
 * How an Interaction test with `skill` moves the target's Disposition under its
 * line's rule. A use with its own rule (Wrangling, Performer) passes its steps
 * as `perUseSteps`; those are ladder steps, so they apply on a ladder line only.
 * DH2 reads the NPC's Personality row for the skill; with no row, no effect is
 * printed and the GM adjudicates.
 */
export function socialDispositionShift(state: DispositionState, skill: string, outcome: InteractionOutcome, perUseSteps: number | null): DispositionShift {
    const { model } = state;
    if (model.model === 'ladder') {
        const steps = perUseSteps ?? ladderShift(model, outcome.success, outcome.dos, outcome.dof);
        return steps === 0 ? { kind: 'none' } : { kind: 'steps', steps };
    }
    if (model.model !== 'characteristic' || perUseSteps !== null || state.personality === null || !isPersonalitySkill(skill)) return { kind: 'none' };
    const effect = personalityEffect(state.personality.skills[skill], outcome.success, outcome.dos, outcome.dof);
    return effect === null ? { kind: 'none' } : { kind: 'personality', ...effect };
}

/** One provenance-bearing part of the Disposition modifier on a social test. */
export interface DispositionModifierComponent {
    key: string;
    /** Langpack key of the part's label. */
    labelKey: string;
    value: number;
}

/** The roll-modifier bucket the Disposition parts sum into. */
export const DISPOSITION_MODIFIER_BUCKET = 'disposition';

/**
 * The modifier the target's Disposition puts on an Interaction test with
 * `skill`: on a ladder line the step's difficulty; on DH2 the Personality
 * row's printed modifier. DH2 prints no modifier for the Disposition value
 * itself (the GM sets the difficulty), so none is added for it.
 */
export function dispositionModifierComponents(state: DispositionState, skill: string): DispositionModifierComponent[] {
    const { model } = state;
    if (model.model === 'ladder') {
        const stepModifier = ladderModifier(state.value, model);
        return stepModifier === 0 ? [] : [{ key: `${DISPOSITION_MODIFIER_BUCKET}.step`, labelKey: 'WH40K.Disposition.Label', value: stepModifier }];
    }
    if (model.model !== 'characteristic' || state.personality === null || !isPersonalitySkill(skill)) return [];
    const personalityModifier = Math.trunc(state.personality.skills[skill].modifier);
    return personalityModifier === 0
        ? []
        : [{ key: `${DISPOSITION_MODIFIER_BUCKET}.personality`, labelKey: 'WH40K.Disposition.Personality', value: personalityModifier }];
}

/* -------------------------------------------- */
/*  Migration                                   */
/* -------------------------------------------- */

/**
 * Convert a value from the old −3..+3 field to the DH2 0–100 scale: its
 * Neutral 0 becomes 50, the middle of the 40–60 indifferent band,
 * and each old band, worth ±10 on a test, becomes 10 points. Order and spacing
 * are kept: −3 → 20, +3 → 80.
 */
export function ladderToCharacteristic(step: number): number {
    const clampedStep = Math.max(LADDER_STEPS.min, Math.min(LADDER_STEPS.max, Math.trunc(step)));
    return CHARACTERISTIC_INDIFFERENT + clampedStep * LADDER_STEP_MODIFIER;
}

/**
 * Migrate a stored `system.disposition` to the line's scale (#73), in place.
 * Before #73 every line stored the −3..+3 field, and the record carries no
 * scale marker. A DH2 record without one is converted with
 * {@link ladderToCharacteristic}; every record is then stamped with its line's
 * model, so it is never converted twice. A partial update that does not carry
 * the value (a Personality edit) is left alone.
 * @param disposition  The raw `system.disposition` source, of any shape.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: DataModel._migrateData hands over untyped pre-validation source; narrowed below
export function migrateDispositionSource(disposition: unknown, def: DispositionModelDef): void {
    if (typeof disposition !== 'object' || disposition === null || Array.isArray(disposition)) return;
    if ('scale' in disposition || !('value' in disposition)) return;
    const { value } = disposition;
    if (def.model === 'characteristic' && typeof value === 'number' && value >= LADDER_STEPS.min && value <= LADDER_STEPS.max) {
        Reflect.set(disposition, 'value', ladderToCharacteristic(value));
    }
    Reflect.set(disposition, 'scale', def.model);
}

/* -------------------------------------------- */
/*  Interaction cap (DH2 errata)                */
/* -------------------------------------------- */

/**
 * Cap on how many interactions can yield disposition gain for a PC.
 *
 * Per the DH2 errata, an NPC's affection / disposition can be shifted by
 * social interactions only a number of times equal to the PC's Fellowship
 * bonus. Once the cap is reached, further interactions produce no further
 * disposition gain (though they may still produce role-play consequences
 * and may still feed Influence elsewhere).
 *
 * Fellowship bonus is the tens digit of the Fellowship characteristic and
 * is always non-negative; we clamp to a sensible floor of 0 to avoid
 * negative caps from malformed input.
 */
export function getInteractionCap(fellowshipBonus: number): number {
    return nonNegInt(fellowshipBonus);
}

/** Inputs to the interaction-gated disposition gain resolver. */
export interface InteractionDispositionGainInput {
    /** The acting PC's Fellowship bonus (tens digit of Fellowship). */
    pcFellowshipBonus: number;
    /** How many qualifying interactions this PC has already had with this NPC. */
    interactionsSoFar: number;
    /** The raw disposition shift this interaction would produce before the cap. */
    rawGain: number;
}

/** Result of {@link resolveInteractionDispositionGain}. */
export interface InteractionDispositionGainResult {
    /** Disposition shift actually applied (0 once the cap is reached). */
    gain: number;
    /** True if the cap has been reached and no further gains will be applied. */
    atCap: boolean;
    /** Remaining interactions that can still yield disposition gain (0 once at cap). */
    remainingInteractions: number;
}

/**
 * Resolve the actual disposition gain for a social interaction, gating by
 * the PC's Fellowship-bonus cap (DH2 errata).
 *
 * Below the cap the raw gain passes through unchanged; at or above the cap
 * the gain is suppressed to 0 and `atCap` is set. `remainingInteractions`
 * is the count of cap-relevant interactions still available BEFORE this
 * interaction is recorded, so the caller can decide whether to increment
 * the tally.
 *
 * @param input Fellowship bonus, prior interaction count, and raw gain.
 * @returns Applied gain, cap flag, and remaining interaction count.
 */
export function resolveInteractionDispositionGain(input: InteractionDispositionGainInput): InteractionDispositionGainResult {
    const cap = getInteractionCap(input.pcFellowshipBonus);
    const used = nonNegInt(input.interactionsSoFar);
    const remaining = Math.max(0, cap - used);
    if (remaining <= 0) {
        return { gain: 0, atCap: true, remainingInteractions: 0 };
    }
    return { gain: input.rawGain, atCap: false, remainingInteractions: remaining };
}
