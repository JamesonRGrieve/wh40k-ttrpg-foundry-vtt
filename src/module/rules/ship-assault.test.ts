import { describe, expect, it } from 'vitest';
import {
    composePilotManoeuvrabilityTest,
    deriveTarget,
    MANOEUVRABILITY_KEY,
    PILOT_SKILL_KEY,
    resolveOpposedShipTests,
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
    crippledManoeuvrability: 0,
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

    it('splits a Crippled ship’s −10 out of its Manoeuvrability as a named row (#187)', () => {
        // The ship's live Manoeuvrability (5) already carries the −10; the card shows 15 and −10.
        const crippled = { ...SHIP, manoeuvrability: 5, crippledManoeuvrability: -10 };
        const derivation = composePilotManoeuvrabilityTest({ pilotSkill: 40, ship: crippled, difficulty: -20, difficultyKey: 'hard' });
        expect(derivation.modifiers).toEqual([
            { labelKey: MANOEUVRABILITY_KEY, value: 15, data: { ship: 'Errant Vector' } },
            { labelKey: 'WH40K.Voidcraft.Crippled.Component.Manoeuvrability', value: -10 },
            { labelKey: 'hard', value: -20 },
        ]);
        expect(derivation.target).toBe(25);
    });
});

describe('ship-assault — test resolution, Rogue Trader degrees (gen1)', () => {
    const derivation = deriveTarget({ labelKey: 'base', value: 45 }, []);

    it('counts each full 10 of margin as a degree of success, with no base degree', () => {
        // RT Core p.232: Fellowship 42, roll 18 → two degrees.
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: 42 }, []), 18, 'gen1')).toMatchObject({ success: true, dos: 2, dof: 0, method: 'gen1' });
        expect(resolveShipTest(derivation, 23, 'gen1')).toMatchObject({ success: true, dos: 2, dof: 0 });
    });

    it('scores a bare pass as a success with 0 degrees', () => {
        expect(resolveShipTest(derivation, 45, 'gen1')).toMatchObject({ success: true, dos: 0, dof: 0 });
        expect(resolveShipTest(derivation, 37, 'gen1')).toMatchObject({ success: true, dos: 0 });
    });

    it('counts each full 10 of failure margin as a degree of failure', () => {
        expect(resolveShipTest(derivation, 86, 'gen1')).toMatchObject({ success: false, dos: 0, dof: 4 });
        expect(resolveShipTest(derivation, 46, 'gen1')).toMatchObject({ success: false, dof: 0 });
    });

    it('auto-passes a natural 01 and auto-fails a natural 100', () => {
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: -5 }, []), 1, 'gen1')).toMatchObject({ success: true, dos: 0 });
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: 120 }, []), 100, 'gen1')).toMatchObject({ success: false, dof: 2 });
    });
});

describe('ship-assault — test resolution, the Gen 2 world override', () => {
    const derivation = deriveTarget({ labelKey: 'base', value: 45 }, []);

    it('counts the base degree plus the tens-digit difference, as the roll engine does', () => {
        expect(resolveShipTest(derivation, 23, 'gen2')).toMatchObject({ success: true, dos: 3, method: 'gen2' });
        expect(resolveShipTest(derivation, 86, 'gen2')).toMatchObject({ success: false, dof: 5 });
    });

    it('never scores a result below one degree', () => {
        expect(resolveShipTest(deriveTarget({ labelKey: 'base', value: -15 }, []), 1, 'gen2')).toMatchObject({ success: true, dos: 1 });
    });
});

describe('ship-assault — opposed tests (RT Core p.233 "Opposed Tests")', () => {
    const at = (target: number, roll: number): ReturnType<typeof resolveShipTest> =>
        resolveShipTest(deriveTarget({ labelKey: 'base', value: target }, []), roll, 'gen1');

    it('a success beats a failure even with 0 RT degrees', () => {
        expect(resolveOpposedShipTests(at(50, 50), at(40, 90))).toEqual({ winner: 'attacker', degrees: 0 });
        expect(resolveOpposedShipTests(at(40, 90), at(50, 48))).toEqual({ winner: 'defender', degrees: 0 });
    });

    it('between two successes the most degrees win, by the difference', () => {
        expect(resolveOpposedShipTests(at(80, 30), at(50, 35))).toEqual({ winner: 'attacker', degrees: 4 });
        expect(resolveOpposedShipTests(at(50, 35), at(80, 30))).toEqual({ winner: 'defender', degrees: 4 });
    });

    it('a failed side scores no degrees against a winner', () => {
        expect(resolveOpposedShipTests(at(80, 50), at(55, 60))).toEqual({ winner: 'attacker', degrees: 3 });
    });

    it('equal results and a double failure go to the defender by 0', () => {
        expect(resolveOpposedShipTests(at(50, 30), at(60, 40))).toEqual({ winner: 'defender', degrees: 0 });
        expect(resolveOpposedShipTests(at(30, 90), at(30, 80))).toEqual({ winner: 'defender', degrees: 0 });
    });
});
