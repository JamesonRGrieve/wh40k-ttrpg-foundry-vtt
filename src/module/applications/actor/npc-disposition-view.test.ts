import { describe, expect, it } from 'vitest';
import { DISPOSITION_MODELS, type NpcPersonality } from '../../rules/disposition';
import { npcDispositionView } from './npc-disposition-view';

/** The NPC sheet's Disposition panel (#73), per line model. */
const ROW = { modifier: 0, effect: '', basis: '' as const };
const PERSONALITY: NpcPersonality = {
    name: 'Clever',
    zeroDisposition: 'Ends the conversation.',
    skills: { charm: { modifier: 20, effect: '5', basis: 'dos' }, command: ROW, deceive: ROW, inquiry: ROW, intimidate: ROW, scrutiny: ROW },
};

/** The NPC's skill-label lookup, as the sheet passes it. */
const label = (skill: string): string => `${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;

describe('npcDispositionView (#73)', () => {
    it('DH2: the 0–100 value, the test and the Personality rows', () => {
        const view = npcDispositionView({ value: 55, model: DISPOSITION_MODELS.characteristic, personality: PERSONALITY }, label);
        expect(view).toMatchObject({ visible: true, model: 'characteristic', value: 55, min: 0, max: 100, testable: true, zero: false, steps: [] });
        expect(view.personality?.name).toBe('Clever');
        expect(view.personality?.rows.map((row) => row.skill)).toEqual(['charm', 'command', 'deceive', 'inquiry', 'intimidate', 'scrutiny']);
        expect(view.personality?.rows.at(0)).toEqual({
            skill: 'charm',
            label: 'Charm',
            modifier: 20,
            effect: '5',
            basis: 'dos',
            path: 'system.disposition.personality.skills.charm',
        });
    });

    it('DH2: flags zero Disposition', () => {
        expect(npcDispositionView({ value: 0, model: DISPOSITION_MODELS.characteristic, personality: PERSONALITY }, label).zero).toBe(true);
    });

    it('ladder: the seven steps from Easy to Very Hard, the held one selected, no test or Personality', () => {
        const view = npcDispositionView({ value: -1, model: DISPOSITION_MODELS.ladderDegrees, personality: null }, label);
        expect(view).toMatchObject({ visible: true, model: 'ladder', testable: false, personality: null });
        expect(view.steps.map((step) => [step.step, step.modifier, step.difficultyKey])).toEqual([
            ['+3', '+30', 'WH40K.Difficulty.Easy'],
            ['+2', '+20', 'WH40K.Difficulty.Routine'],
            ['+1', '+10', 'WH40K.Difficulty.Ordinary'],
            ['+0', '+0', 'WH40K.Difficulty.Challenging'],
            ['-1', '-10', 'WH40K.Difficulty.Difficult'],
            ['-2', '-20', 'WH40K.Difficulty.Hard'],
            ['-3', '-30', 'WH40K.Difficulty.VeryHard'],
        ]);
        expect(view.steps.filter((step) => step.selected).map((step) => step.value)).toEqual([-1]);
    });

    it('none: hidden', () => {
        expect(npcDispositionView({ value: 0, model: DISPOSITION_MODELS.none, personality: null }, label).visible).toBe(false);
    });
});
