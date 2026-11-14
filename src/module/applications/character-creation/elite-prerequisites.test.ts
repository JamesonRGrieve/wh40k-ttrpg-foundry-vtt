import { describe, expect, it } from 'vitest';
import { characteristicGates, elitePrerequisites, offerGates, xpShortfall } from './elite-prerequisites.ts';

describe('elite prerequisites (#717)', () => {
    const system = {
        prerequisites: [
            { type: 'characteristic', key: 'willpower', value: 35 },
            { type: 'influence', key: 'influence', value: 30 },
            { type: 'talent', key: 'Resistance' },
            { type: 'nonsense', key: 'x' },
            { type: 'skill' },
            null,
        ],
    };

    it('keeps only well-formed prerequisites of a known type', () => {
        expect(elitePrerequisites(system).map((p) => p.type)).toEqual(['characteristic', 'influence', 'talent']);
        expect(elitePrerequisites({ prerequisites: 'Willpower 35' })).toEqual([]);
        expect(elitePrerequisites({})).toEqual([]);
    });

    it('splits the gates checked on offer from those checked at commit', () => {
        const all = elitePrerequisites(system);
        expect(offerGates(all).map((p) => p.type)).toEqual(['influence', 'talent']);
        expect(characteristicGates(all).map((p) => p.key)).toEqual(['willpower']);
    });

    it('reports the XP shortfall only when the cost exceeds the budget', () => {
        expect(xpShortfall(1500, 1000)).toEqual({ cost: 1500, available: 1000 });
        expect(xpShortfall(1000, 1000)).toBeNull();
    });
});
