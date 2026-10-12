import { describe, expect, it } from 'vitest';
import type { ShipAssaultShip } from './ship-assault';
import {
    allocateBoardingDegrees,
    BOARDING_FAILED_BREAK_FREE_PENALTY,
    BOARDING_HULL_DAMAGE_PER_DEGREE,
    BOARDING_KEYS,
    BOARDING_LOCK_DIFFICULTY,
    BOARDING_RESOLUTION_FAVORS_DEFENDER,
    BOARDING_TURRET_BONUS_PER_POINT,
    boardingDifferenceBonus,
    composeBoardingCommand,
    computeBoardingDamage,
    resolveBoardingMorale,
    resolveBoardingRound,
} from './ship-boarding';

/**
 * RT Boarding Action pins (#188 — RT Core p.215, turret bonus p.220).
 *
 * Regression guards for the RAW corrections: the previous resolver dealt Hull
 * AND 1d5/1d5 crew/morale on every win, invented a "boarders lost at 3+ DoS"
 * outcome, and composed no Crew/Hull/Turret bonuses at all.
 */

function ship(overrides: Partial<ShipAssaultShip> = {}): ShipAssaultShip {
    return {
        name: 'Ship',
        hullType: 'frigate',
        manoeuvrability: 10,
        armour: 18,
        turretRating: 0,
        crewPopulation: 50,
        hullIntegrity: 35,
        morale: 60,
        ...overrides,
    };
}

describe('ship-boarding — invariants', () => {
    it('pins the printed constants', () => {
        expect(BOARDING_RESOLUTION_FAVORS_DEFENDER).toBe(true);
        expect(BOARDING_LOCK_DIFFICULTY).toBe(-20);
        expect(BOARDING_FAILED_BREAK_FREE_PENALTY).toBe(-20);
        expect(BOARDING_TURRET_BONUS_PER_POINT).toBe(10);
        expect(BOARDING_HULL_DAMAGE_PER_DEGREE).toBe(1);
    });
});

describe('ship-boarding — difference bonus', () => {
    it('grants +10 per full 10 points the side leads by', () => {
        expect(boardingDifferenceBonus(80, 50)).toBe(30);
        expect(boardingDifferenceBonus(59, 50)).toBe(0);
        expect(boardingDifferenceBonus(60, 50)).toBe(10);
    });

    it('grants nothing to the trailing or tied side', () => {
        expect(boardingDifferenceBonus(50, 80)).toBe(0);
        expect(boardingDifferenceBonus(50, 50)).toBe(0);
    });
});

describe('ship-boarding — Command composition', () => {
    it('stacks crew, hull and turret bonuses with provenance', () => {
        const mine = ship({ name: 'Errant Vector', crewPopulation: 75, hullIntegrity: 60, turretRating: 2 });
        const theirs = ship({ crewPopulation: 50, hullIntegrity: 35 });
        const derivation = composeBoardingCommand({ ship: mine, commandSkill: 45, failedBreakFree: false }, theirs);
        expect(derivation.base).toEqual({ labelKey: BOARDING_KEYS.commandSkill, value: 45 });
        expect(derivation.modifiers.map((m) => [m.labelKey, m.value])).toEqual([
            [BOARDING_KEYS.crewAdvantage, 20],
            [BOARDING_KEYS.hullAdvantage, 20],
            [BOARDING_KEYS.turrets, 20],
        ]);
        expect(derivation.target).toBe(105);
    });

    it('applies the failed break-free penalty and a situational modifier', () => {
        const derivation = composeBoardingCommand(
            { ship: ship(), commandSkill: 40, failedBreakFree: true, situational: { value: 20, label: 'Reinforcements' } },
            ship(),
        );
        expect(derivation.modifiers.map((m) => m.value)).toEqual([-20, 20]);
        expect(derivation.modifiers[1]?.data).toEqual({ label: 'Reinforcements' });
        expect(derivation.target).toBe(40);
    });

    it('omits zero rows so the card shows only live modifiers', () => {
        const derivation = composeBoardingCommand({ ship: ship(), commandSkill: 40, failedBreakFree: false, situational: { value: 0, label: 'none' } }, ship());
        expect(derivation.modifiers).toEqual([]);
        expect(derivation.target).toBe(40);
    });
});

describe('ship-boarding — opposed round', () => {
    it('awards the attacker the margin in degrees', () => {
        const round = resolveBoardingRound({ attackerRoll: 10, attackerTarget: 60, defenderRoll: 45, defenderTarget: 50 });
        expect(round).toEqual({ winner: 'attacker', attackerDoS: 6, defenderDoS: 1, degrees: 5 });
    });

    it('lets the defender win and inflict damage too', () => {
        const round = resolveBoardingRound({ attackerRoll: 90, attackerTarget: 40, defenderRoll: 10, defenderTarget: 50 });
        expect(round.winner).toBe('defender');
        expect(round.degrees).toBe(5);
    });

    it('resolves a tie for the defender by 0 degrees', () => {
        const round = resolveBoardingRound({ attackerRoll: 40, attackerTarget: 40, defenderRoll: 50, defenderTarget: 50 });
        expect(round).toEqual({ winner: 'defender', attackerDoS: 1, defenderDoS: 1, degrees: 0 });
    });
});

describe('ship-boarding — degree allocation and damage', () => {
    it('clamps the hull share into the available degrees', () => {
        expect(allocateBoardingDegrees(3, 1)).toEqual({ hullDegrees: 1, crewDegrees: 2 });
        expect(allocateBoardingDegrees(3, 9)).toEqual({ hullDegrees: 3, crewDegrees: 0 });
        expect(allocateBoardingDegrees(3, -2)).toEqual({ hullDegrees: 0, crewDegrees: 3 });
    });

    it('deals one option per degree, never both', () => {
        const damage = computeBoardingDamage({ allocation: { hullDegrees: 1, crewDegrees: 2 }, crewD5s: [3, 4, 5], moraleD5s: [1, 2, 5] });
        expect(damage).toEqual({ hullDamage: 1, crewDamage: 7, moraleDamage: 3 });
    });

    it('deals nothing for zero degrees', () => {
        expect(computeBoardingDamage({ allocation: allocateBoardingDegrees(0, 0), crewD5s: [], moraleD5s: [] })).toEqual({
            hullDamage: 0,
            crewDamage: 0,
            moraleDamage: 0,
        });
    });
});

describe('ship-boarding — loser morale check', () => {
    it('fights on at or under Morale and routs above it', () => {
        expect(resolveBoardingMorale(60, 60).fightsOn).toBe(true);
        expect(resolveBoardingMorale(61, 60).fightsOn).toBe(false);
    });
});
