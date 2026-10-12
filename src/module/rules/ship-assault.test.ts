import { describe, expect, it } from 'vitest';
import {
    composePilotManoeuvrabilityTest,
    deriveTarget,
    MANOEUVRABILITY_KEY,
    PILOT_SKILL_KEY,
    resolveShipTest,
    SITUATIONAL_MODIFIER_KEY,
    situationalComponents,
    supportsShipAssault,
    type ShipAssaultShip,
} from './ship-assault';

const SHIP: ShipAssaultShip = {
    name: 'Errant Vector',
    hullType: 'frigate',
    manoeuvrability: 15,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 70,
};

describe('ship-assault — gating', () => {
    it('admits Rogue Trader voidcraft only', () => {
        expect(supportsShipAssault('rt')).toBe(true);
        for (const id of ['dh1', 'dh2', 'bc', 'dw', 'ow', 'im']) expect(supportsShipAssault(id)).toBe(false);
    });
});

describe('ship-assault — derivation', () => {
    it('sums base and modifiers into the target', () => {
        const derivation = deriveTarget({ labelKey: 'base', value: 40 }, [
            { labelKey: 'a', value: 10 },
            { labelKey: 'b', value: -25 },
        ]);
        expect(derivation.target).toBe(25);
    });

    it('drops a zero situational modifier and keeps a non-zero one with its label', () => {
        expect(situationalComponents({ value: 0, label: 'x' })).toEqual([]);
        expect(situationalComponents(undefined)).toEqual([]);
        expect(situationalComponents({ value: -10, label: 'Ghost Field' })).toEqual([
            { labelKey: SITUATIONAL_MODIFIER_KEY, value: -10, data: { label: 'Ghost Field' } },
        ]);
    });

    it('composes Pilot + Manoeuvrability + difficulty with provenance', () => {
        const derivation = composePilotManoeuvrabilityTest({ pilotSkill: 40, ship: SHIP, difficulty: -20, difficultyKey: 'hard' });
        expect(derivation.base).toEqual({ labelKey: PILOT_SKILL_KEY, value: 40 });
        expect(derivation.modifiers).toEqual([
            { labelKey: MANOEUVRABILITY_KEY, value: 15, data: { ship: 'Errant Vector' } },
            { labelKey: 'hard', value: -20 },
        ]);
        expect(derivation.target).toBe(35);
    });
});

describe('ship-assault — test resolution', () => {
    const derivation = deriveTarget({ labelKey: 'base', value: 45 }, []);

    it('scores degrees of success on a pass', () => {
        expect(resolveShipTest(derivation, 23)).toMatchObject({ success: true, dos: 3, dof: 0 });
    });

    it('scores degrees of failure on a miss', () => {
        expect(resolveShipTest(derivation, 86)).toMatchObject({ success: false, dos: 0, dof: 5 });
    });

    it('auto-passes a natural 01 with at least one degree, even below 1', () => {
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: -5 }, []), 1)).toMatchObject({ success: true, dos: 1 });
    });

    it('auto-fails a natural 100', () => {
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: 120 }, []), 100)).toMatchObject({ success: false, dof: 1 });
    });
});
