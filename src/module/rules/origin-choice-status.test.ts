import { describe, expect, it } from 'vitest';
import { originChoiceStatus } from './origin-choice-status.ts';

const opts = (n: number): object[] => Array.from({ length: n }, (_, i) => ({ value: `o${i}` }));

describe('originChoiceStatus', () => {
    it('a choice with picks short of its count is pending', () => {
        expect(originChoiceStatus([{ label: 'Talent', count: 2, options: opts(3) }], { Talent: ['o0'] })).toEqual({ pending: ['Talent'], unfillable: [] });
    });

    it('a satisfied choice is neither pending nor unfillable', () => {
        expect(originChoiceStatus([{ label: 'Talent', options: opts(2) }], { Talent: ['o1'] })).toEqual({ pending: [], unfillable: [] });
    });

    it('a choice with no options is unfillable, not pending, so it cannot block the builder', () => {
        expect(originChoiceStatus([{ label: 'Divination', options: [] }, { label: 'Skill' }], {})).toEqual({
            pending: [],
            unfillable: ['Divination', 'Skill'],
        });
    });

    it('a choice offering fewer options than its count needs only as many picks as there are options', () => {
        expect(originChoiceStatus([{ label: 'Talent', count: 3, options: opts(1) }], { Talent: ['o0'] })).toEqual({ pending: [], unfillable: [] });
    });

    it('repeated labels are keyed as the choice dialog keys them', () => {
        expect(
            originChoiceStatus(
                [
                    { label: 'Skill', options: opts(2) },
                    { label: 'Skill', options: opts(2) },
                ],
                { Skill: ['o0'] },
            ),
        ).toEqual({ pending: ['Skill (2)'], unfillable: [] });
    });

    it('a string pick (legacy single value) does not count as an array of picks', () => {
        expect(originChoiceStatus([{ name: 'Weapon', options: opts(2) }], { Weapon: 'o0' })).toEqual({ pending: ['Weapon'], unfillable: [] });
    });
});
