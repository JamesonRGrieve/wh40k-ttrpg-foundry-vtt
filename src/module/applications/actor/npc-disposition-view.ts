/**
 * @file The NPC sheet's Disposition panel (#73), as a pure display model.
 *
 * The panel follows the NPC's line's Disposition model: DH2's 0–100
 * characteristic with a Disposition test and the NPC's Personality, the other
 * FFG lines' seven-step ladder, or nothing on a line without a Disposition rule.
 */

import {
    type DispositionState,
    isZeroDisposition,
    ladderDifficultyKey,
    ladderModifier,
    PERSONALITY_SKILLS,
    type PersonalitySkill,
} from '../../rules/disposition.ts';
import { formatSigned } from '../../utils/format.ts';

/** One ladder step, for the step picker. */
interface DispositionStepOption {
    value: number;
    /** The step, signed ("+2"). */
    step: string;
    /** Langpack key of the difficulty the step sets. */
    difficultyKey: string;
    /** The modifier the step sets, signed ("+20"). */
    modifier: string;
    selected: boolean;
}

/** One Personality row, for its inputs. */
interface PersonalityRowView {
    skill: PersonalitySkill;
    label: string;
    modifier: number;
    effect: string;
    basis: string;
    /** Form field path prefix (`system.disposition.personality.skills.<skill>`). */
    path: string;
}

/** The Disposition panel. */
export interface NpcDispositionView {
    visible: boolean;
    /** `characteristic` or `ladder`. */
    model: string;
    value: number;
    min: number;
    max: number;
    testable: boolean;
    /** DH2: Disposition 0, where the Personality's zero-Disposition response applies. */
    zero: boolean;
    /** Ladder lines: the seven steps. Empty on DH2. */
    steps: DispositionStepOption[];
    /** DH2: the Personality's name, zero-Disposition response and rows. `null` on a ladder line. */
    personality: { name: string; zeroDisposition: string; rows: PersonalityRowView[] } | null;
}

const PERSONALITY_PATH = 'system.disposition.personality';

/**
 * Build the panel from the NPC's Disposition.
 * @param state  The NPC's Disposition (`actor.dispositionState`).
 * @param skillLabel  The NPC's display label for a skill key (its line's skill catalog).
 */
export function npcDispositionView(state: DispositionState, skillLabel: (skill: string) => string): NpcDispositionView {
    const { model, value } = state;
    const base = { model: model.model, value, min: model.min, max: model.max, testable: model.testable, zero: isZeroDisposition(value, model) };
    if (model.model === 'none') return { ...base, visible: false, steps: [], personality: null };
    if (model.model === 'ladder') {
        const steps: DispositionStepOption[] = [];
        for (let step = model.max; step >= model.min; step -= 1) {
            steps.push({
                value: step,
                step: formatSigned(step),
                difficultyKey: ladderDifficultyKey(step, model),
                modifier: formatSigned(ladderModifier(step, model)),
                selected: step === value,
            });
        }
        return { ...base, visible: true, steps, personality: null };
    }
    const personality = state.personality;
    return {
        ...base,
        visible: true,
        steps: [],
        personality:
            personality === null
                ? null
                : {
                      name: personality.name,
                      zeroDisposition: personality.zeroDisposition,
                      rows: PERSONALITY_SKILLS.map((skill) => ({
                          skill,
                          label: skillLabel(skill),
                          ...personality.skills[skill],
                          path: `${PERSONALITY_PATH}.skills.${skill}`,
                      })),
                  },
    };
}
