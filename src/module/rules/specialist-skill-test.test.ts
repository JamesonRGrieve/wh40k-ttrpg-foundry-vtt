import { describe, expect, it } from 'vitest';
import { printedSpecialisationTest } from './specialist-skill-test.ts';

describe('printedSpecialisationTest', () => {
    it('a driver with Operate (Surface) tests with that entry: its target and rank', () => {
        expect(printedSpecialisationTest('Operate', 20, { name: 'Surface', current: 45, rank: 2 }, 'Surface')).toEqual({
            label: 'Operate: Surface',
            target: 45,
            skillRank: 2,
        });
    });

    it('a driver without the matching specialisation tests untrained: the parent target at rank 0', () => {
        expect(printedSpecialisationTest('Operate', 20, undefined, 'Surface')).toEqual({ label: 'Operate: Surface', target: 20, skillRank: 0 });
    });

    it('reads a legacy trained flag when the entry carries no rank', () => {
        expect(printedSpecialisationTest('Trade', 15, { name: 'Armourer', current: 35, trained: true }, 'Armourer').skillRank).toBe(1);
    });
});
