import { describe, expect, it } from 'vitest';
import { untrainedSkillRulesFor } from './index.ts';

/**
 * Each line declares which skills it refuses untrained (#757), as its core rulebook
 * says: the career lines an Advanced skill, DH2 and Only War a Specialist skill,
 * Black Crusade the three skills its table marks, Imperium Maledictum none modelled.
 */
describe('untrainedSkillRulesFor (#757)', () => {
    it.each(['dh1', 'rt', 'dw'])('%s refuses an Advanced skill untrained', (line) => {
        expect(untrainedSkillRulesFor(line)).toEqual({ rule: 'advanced', listed: {} });
    });

    it.each(['dh2', 'ow'])('%s refuses a Specialist skill untrained', (line) => {
        expect(untrainedSkillRulesFor(line)).toEqual({ rule: 'specialist', listed: {} });
    });

    it('bc refuses only Forbidden Lore and Operate (Aeronautica, Voidship)', () => {
        expect(untrainedSkillRulesFor('bc')).toEqual({ rule: 'listed', listed: { forbiddenLore: '*', operate: ['Aeronautica', 'Voidship'] } });
    });

    it('im refuses nothing, and an unknown line has no rule', () => {
        expect(untrainedSkillRulesFor('im')).toEqual({ rule: 'none', listed: {} });
        expect(untrainedSkillRulesFor('xx')).toBeNull();
        expect(untrainedSkillRulesFor(undefined)).toBeNull();
    });
});
