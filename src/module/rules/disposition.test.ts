import { describe, expect, it } from 'vitest';
import type { DispositionModelDef } from '../config/game-systems/types';
import {
    clampDisposition,
    DISPOSITION_MODELS,
    DISPOSITION_MODIFIER_BUCKET,
    type DispositionState,
    dispositionModifierComponents,
    getInteractionCap,
    isPersonalitySkill,
    isZeroDisposition,
    ladderDifficultyKey,
    ladderModifier,
    ladderShift,
    ladderToCharacteristic,
    migrateDispositionSource,
    type NpcPersonality,
    PERSONALITY_SKILLS,
    type PersonalityRow,
    personalityEffect,
    resolveInteractionDispositionGain,
    socialDispositionShift,
} from './disposition';

/**
 * NPC Disposition (#73). DH2 is a 0–100 characteristic moved by the
 * NPC's Personality; DH1/RT/DW and BC/OW print a seven-step ladder whose step sets
 * the Interaction test's difficulty and moves with its degrees; IM has none.
 */
const { characteristic, ladderStepPlusDegrees, ladderDegrees, none } = DISPOSITION_MODELS;

const EMPTY_ROW: PersonalityRow = { modifier: 0, effect: '', basis: '' };

/** The Aggressive Personality (from DH2's Personality table), as a GM would enter it. */
function aggressive(): NpcPersonality {
    return {
        name: 'Aggressive',
        zeroDisposition: 'Lashes out at the Acolytes.',
        skills: {
            charm: { modifier: -20, effect: '5', basis: 'dos' },
            command: { modifier: 0, effect: '5', basis: 'dof' },
            deceive: { modifier: 10, effect: '10', basis: 'dos' },
            inquiry: { modifier: 10, effect: '-10', basis: 'dof' },
            intimidate: { modifier: -10, effect: '5', basis: 'dof' },
            scrutiny: { modifier: 20, effect: '', basis: '' },
        },
    };
}

function dh2(value: number, personality: NpcPersonality | null = aggressive()): DispositionState {
    return { value, model: characteristic, personality };
}

function ladder(value: number, model: DispositionModelDef = ladderStepPlusDegrees): DispositionState {
    return { value, model, personality: null };
}

describe('line models (#73)', () => {
    it('DH2: a testable 0–100 characteristic starting mid-way through the 40–60 indifferent band', () => {
        expect(characteristic).toMatchObject({ model: 'characteristic', min: 0, max: 100, initial: 50, testable: true });
    });

    it('ladder lines: seven steps of ±10 starting at Indifferent', () => {
        for (const model of [ladderStepPlusDegrees, ladderDegrees]) {
            expect(model).toMatchObject({ model: 'ladder', min: -3, max: 3, initial: 0, stepModifier: 10, testable: false });
        }
        expect(ladderStepPlusDegrees.successBaseSteps).toBe(1);
        expect(ladderDegrees.successBaseSteps).toBe(0);
    });

    it('none: nothing to track or test', () => {
        expect(none).toMatchObject({ model: 'none', testable: false });
    });
});

describe('clampDisposition / isZeroDisposition', () => {
    it('keeps a value on its scale, fractions truncated', () => {
        expect(clampDisposition(120, characteristic)).toBe(100);
        expect(clampDisposition(-5, characteristic)).toBe(0);
        expect(clampDisposition(47.9, characteristic)).toBe(47);
        expect(clampDisposition(5, ladderDegrees)).toBe(3);
        expect(clampDisposition(-9, ladderDegrees)).toBe(-3);
    });

    it('flags zero Disposition on DH2 only', () => {
        expect(isZeroDisposition(0, characteristic)).toBe(true);
        expect(isZeroDisposition(1, characteristic)).toBe(false);
        expect(isZeroDisposition(0, ladderDegrees)).toBe(false);
    });
});

describe('ladder (DH1, RT, BC, DW, OW)', () => {
    it('sets the difficulty from Very Hard (−30) to Easy (+30)', () => {
        expect([-3, -2, -1, 0, 1, 2, 3].map((step) => ladderModifier(step, ladderDegrees))).toEqual([-30, -20, -10, 0, 10, 20, 30]);
        expect(ladderModifier(9, ladderDegrees)).toBe(30);
        expect(ladderModifier(2, characteristic)).toBe(0);
    });

    it('names each step by its difficulty', () => {
        expect([3, 0, -3].map((step) => ladderDifficultyKey(step, ladderDegrees))).toEqual([
            'WH40K.Difficulty.Easy',
            'WH40K.Difficulty.Challenging',
            'WH40K.Difficulty.VeryHard',
        ]);
    });

    it('DH1/RT/DW: a success gains one step plus one per degree', () => {
        expect(ladderShift(ladderStepPlusDegrees, true, 2, 0)).toBe(3);
        expect(ladderShift(ladderStepPlusDegrees, true, 0, 0)).toBe(1);
    });

    it('BC/OW: a success gains one step per degree', () => {
        expect(ladderShift(ladderDegrees, true, 2, 0)).toBe(2);
    });

    it('a failure loses one step per degree of failure', () => {
        expect(ladderShift(ladderStepPlusDegrees, false, 0, 2)).toBe(-2);
        expect(ladderShift(ladderDegrees, false, 0, 1)).toBe(-1);
    });

    it('does nothing off a ladder line', () => {
        expect(ladderShift(characteristic, true, 3, 0)).toBe(0);
    });
});

describe('Personality (DH2)', () => {
    it('lists the six Interaction skills a Personality table prints', () => {
        expect([...PERSONALITY_SKILLS]).toEqual(['charm', 'command', 'deceive', 'inquiry', 'intimidate', 'scrutiny']);
        expect(isPersonalitySkill('charm')).toBe(true);
        expect(isPersonalitySkill('dodge')).toBe(false);
    });

    it('applies an effect on the outcome its basis counts, times the degrees', () => {
        const charm = aggressive().skills.charm;
        expect(personalityEffect(charm, true, 3, 0)).toEqual({ formula: '5', degrees: 3 });
        expect(personalityEffect(charm, false, 0, 2)).toBeNull();
        const command = aggressive().skills.command;
        expect(personalityEffect(command, false, 0, 2)).toEqual({ formula: '5', degrees: 2 });
        expect(personalityEffect(command, true, 2, 0)).toBeNull();
    });

    it('keeps dice effects as formulas to roll', () => {
        expect(personalityEffect({ modifier: 0, effect: '-1d5', basis: 'dof' }, false, 0, 1)).toEqual({ formula: '-1d5', degrees: 1 });
    });

    it('applies nothing for N/A, a blank effect, or zero degrees', () => {
        expect(personalityEffect(aggressive().skills.scrutiny, true, 3, 0)).toBeNull();
        expect(personalityEffect({ modifier: 0, effect: ' ', basis: 'dos' }, true, 3, 0)).toBeNull();
        expect(personalityEffect(aggressive().skills.charm, true, 0, 0)).toBeNull();
    });
});

describe('socialDispositionShift', () => {
    const won = { success: true, dos: 2, dof: 0 };
    const lost = { success: false, dos: 0, dof: 2 };

    it('DH2: the NPC Personality row for the skill', () => {
        expect(socialDispositionShift(dh2(50), 'charm', won, null)).toEqual({ kind: 'personality', formula: '5', degrees: 2 });
        expect(socialDispositionShift(dh2(50), 'inquiry', lost, null)).toEqual({ kind: 'personality', formula: '-10', degrees: 2 });
        expect(socialDispositionShift(dh2(50), 'charm', lost, null)).toEqual({ kind: 'none' });
    });

    it('DH2: no Personality entry, a skill without a row, or a use with its own ladder rule leaves it to the GM', () => {
        const blank: NpcPersonality = {
            name: '',
            zeroDisposition: '',
            skills: { charm: EMPTY_ROW, command: EMPTY_ROW, deceive: EMPTY_ROW, inquiry: EMPTY_ROW, intimidate: EMPTY_ROW, scrutiny: EMPTY_ROW },
        };
        expect(socialDispositionShift(dh2(50, blank), 'charm', won, null)).toEqual({ kind: 'none' });
        expect(socialDispositionShift(dh2(50), 'wrangling', won, null)).toEqual({ kind: 'none' });
        expect(socialDispositionShift(dh2(50), 'charm', won, 2)).toEqual({ kind: 'none' });
    });

    it('ladder: the line rule, or the use’s own steps', () => {
        expect(socialDispositionShift(ladder(0), 'intimidate', won, null)).toEqual({ kind: 'steps', steps: 3 });
        expect(socialDispositionShift(ladder(0, ladderDegrees), 'command', lost, null)).toEqual({ kind: 'steps', steps: -2 });
        expect(socialDispositionShift(ladder(0), 'wrangling', won, 1)).toEqual({ kind: 'steps', steps: 1 });
        expect(socialDispositionShift(ladder(0), 'wrangling', lost, 0)).toEqual({ kind: 'none' });
    });

    it('none: nothing', () => {
        expect(socialDispositionShift({ value: 0, model: none, personality: null }, 'charm', won, null)).toEqual({ kind: 'none' });
    });
});

describe('dispositionModifierComponents', () => {
    it('ladder: the step’s difficulty on any Interaction test', () => {
        expect(dispositionModifierComponents(ladder(-1), 'command')).toEqual([
            { key: `${DISPOSITION_MODIFIER_BUCKET}.step`, labelKey: 'WH40K.Disposition.Label', value: -10 },
        ]);
        expect(dispositionModifierComponents(ladder(0), 'command')).toEqual([]);
    });

    it('DH2: the Personality row’s modifier, never one for the value itself', () => {
        expect(dispositionModifierComponents(dh2(10), 'charm')).toEqual([
            { key: `${DISPOSITION_MODIFIER_BUCKET}.personality`, labelKey: 'WH40K.Disposition.Personality', value: -20 },
        ]);
        expect(dispositionModifierComponents(dh2(90), 'command')).toEqual([]);
        expect(dispositionModifierComponents(dh2(90), 'wrangling')).toEqual([]);
        expect(dispositionModifierComponents(dh2(90, null), 'charm')).toEqual([]);
    });
});

describe('migration from the old −3..+3 field', () => {
    it('maps Neutral 0 to 50 and each band to 10 points', () => {
        expect([-3, -2, -1, 0, 1, 2, 3].map(ladderToCharacteristic)).toEqual([20, 30, 40, 50, 60, 70, 80]);
        expect(ladderToCharacteristic(9)).toBe(80);
    });

    it('converts an unmarked DH2 record and stamps it', () => {
        const source = { value: -2 };
        migrateDispositionSource(source, characteristic);
        expect(source).toEqual({ value: 30, scale: 'characteristic' });
    });

    it('is idempotent: a stamped record is never converted again', () => {
        const source = { value: 2, scale: 'characteristic' };
        migrateDispositionSource(source, characteristic);
        expect(source).toEqual({ value: 2, scale: 'characteristic' });
    });

    it('leaves an unmarked DH2 value already on the 0–100 scale, and stamps it', () => {
        const source = { value: 72 };
        migrateDispositionSource(source, characteristic);
        expect(source).toEqual({ value: 72, scale: 'characteristic' });
    });

    it('keeps a ladder line’s value, which was already a ladder step', () => {
        const source = { value: -2 };
        migrateDispositionSource(source, ladderDegrees);
        expect(source).toEqual({ value: -2, scale: 'ladder' });
    });

    it('ignores a partial update without a value, and anything that is not a record', () => {
        const personalityEdit = { personality: { name: 'Clever' } };
        migrateDispositionSource(personalityEdit, characteristic);
        expect(personalityEdit).toEqual({ personality: { name: 'Clever' } });
        expect(() => {
            migrateDispositionSource(undefined, characteristic);
            migrateDispositionSource(3, characteristic);
            migrateDispositionSource([1], characteristic);
        }).not.toThrow();
    });
});

describe('getInteractionCap', () => {
    it('returns the Fellowship bonus as the cap', () => {
        expect(getInteractionCap(4)).toBe(4);
        expect(getInteractionCap(0)).toBe(0);
    });
    it('clamps negative bonuses to zero (malformed input)', () => {
        expect(getInteractionCap(-3)).toBe(0);
    });
});

describe('resolveInteractionDispositionGain', () => {
    it('passes the raw gain through below the Fellowship-bonus cap', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 4, interactionsSoFar: 1, rawGain: 1 });
        expect(r).toEqual({ gain: 1, atCap: false, remainingInteractions: 3 });
    });

    it('reports remainingInteractions = cap − used before incrementing the tally', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 5, interactionsSoFar: 0, rawGain: 2 });
        expect(r.gain).toBe(2);
        expect(r.remainingInteractions).toBe(5);
    });

    it('suppresses the gain and flags atCap once interactionsSoFar reaches the cap', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 3, interactionsSoFar: 3, rawGain: 1 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });

    it('treats over-cap tallies the same as exactly at-cap (no negative remaining)', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 2, interactionsSoFar: 7, rawGain: 3 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });

    it('zero Fellowship bonus means no interaction-based disposition gain is ever earned', () => {
        const r = resolveInteractionDispositionGain({ pcFellowshipBonus: 0, interactionsSoFar: 0, rawGain: 1 });
        expect(r).toEqual({ gain: 0, atCap: true, remainingInteractions: 0 });
    });
});
