import { describe, expect, it } from 'vitest';
import {
    BOARDING_BOARDERS_LOST_DOS,
    BOARDING_HULL_DAMAGE_PER_DOS,
    BOARDING_RESOLUTION_FAVORS_DEFENDER,
    computeBoardingDamage,
    degreesOfSuccess,
    resolveBoarding,
    resolveBoardingOpposed,
} from './ship-boarding';

/**
 * RT Boarding Actions resolver pins (#188 — core.md L9997 §Ramming and
 * Boarding Actions, modifier sources at L9383 / L9463 / L10288 / L10292
 * / L10321).
 *
 * Pins:
 *   - Constant exports (tie semantics, 1 hull per DoS, 3 DoS for
 *     boarders-lost) so a casual touch can't silently flip them.
 *   - DoS math at the boundary.
 *   - Opposed Command resolver: tie → defender, defender +3 DoS →
 *     boardersLost.
 *   - Damage math returns netDoS hull + the two 1d5 dice as-is.
 *   - Top-level orchestrator emits `damage: null` on a miss or
 *     boarders-lost result.
 */
describe('ship-boarding — invariants', () => {
    it('declares constants explicitly so a typo trips the test', () => {
        expect(BOARDING_RESOLUTION_FAVORS_DEFENDER).toBe(true);
        expect(BOARDING_HULL_DAMAGE_PER_DOS).toBe(1);
        expect(BOARDING_BOARDERS_LOST_DOS).toBe(3);
    });
});

describe('ship-boarding — degrees of success', () => {
    it('matches the shared DoS rule', () => {
        expect(degreesOfSuccess(50, 40)).toBe(0);
        expect(degreesOfSuccess(40, 40)).toBe(1);
        // DH2 RAW: DoS = 1 + floor((target-roll)/10) → 1 + floor(39/10) = 4
        expect(degreesOfSuccess(1, 40)).toBe(4);
    });
});

describe('ship-boarding — resolveBoardingOpposed', () => {
    it('attacker wins on more DoS', () => {
        const r = resolveBoardingOpposed({
            attackerRoll: 20,
            attackerCommandTarget: 50,
            defenderRoll: 60,
            defenderCommandTarget: 40,
        });
        expect(r.success).toBe(true);
        expect(r.attackerDoS).toBe(4);
        expect(r.defenderDoS).toBe(0);
        expect(r.netDoS).toBe(4);
        expect(r.boardersLost).toBe(false);
    });

    it('tie favours the defender', () => {
        const r = resolveBoardingOpposed({
            attackerRoll: 30,
            attackerCommandTarget: 50,
            defenderRoll: 30,
            defenderCommandTarget: 50,
        });
        expect(r.netDoS).toBe(0);
        expect(r.success).toBe(false);
        expect(r.boardersLost).toBe(false);
    });

    it('defender +3 DoS routes the boarders to lost', () => {
        const r = resolveBoardingOpposed({
            attackerRoll: 60, // 1 DoS at attackerTarget=60
            attackerCommandTarget: 60,
            defenderRoll: 10, // 5 DoS at defenderTarget=50
            defenderCommandTarget: 50,
        });
        expect(r.attackerDoS).toBe(1);
        expect(r.defenderDoS).toBe(5);
        expect(r.netDoS).toBe(-4);
        expect(r.success).toBe(false);
        expect(r.boardersLost).toBe(true);
    });

    it('defender +2 DoS does NOT lose the boarders (only stalled)', () => {
        const r = resolveBoardingOpposed({
            attackerRoll: 55,
            attackerCommandTarget: 55, // 1 DoS
            defenderRoll: 30,
            defenderCommandTarget: 50, // 3 DoS (target 50, roll 30 → (50-30)/10+1 = 3)
        });
        expect(r.attackerDoS).toBe(1);
        expect(r.defenderDoS).toBe(3);
        expect(r.netDoS).toBe(-2);
        expect(r.success).toBe(false);
        expect(r.boardersLost).toBe(false);
    });

    it('attacker fluffs the roll → no breach even if defender also fluffs', () => {
        const r = resolveBoardingOpposed({
            attackerRoll: 95,
            attackerCommandTarget: 40,
            defenderRoll: 95,
            defenderCommandTarget: 40,
        });
        expect(r.success).toBe(false);
        expect(r.boardersLost).toBe(false);
    });
});

describe('ship-boarding — computeBoardingDamage', () => {
    it('1 Hull damage per netDoS, passes 1d5 dice through', () => {
        const d = computeBoardingDamage({ netDoS: 4, rolledCrewD5: 3, rolledMoraleD5: 5 });
        expect(d.hullDamage).toBe(4);
        expect(d.crewDamage).toBe(3);
        expect(d.moraleDamage).toBe(5);
    });

    it('netDoS clamps at 0 so a misuse can never inflict negative hull', () => {
        const d = computeBoardingDamage({ netDoS: -2, rolledCrewD5: 1, rolledMoraleD5: 1 });
        expect(d.hullDamage).toBe(0);
    });
});

describe('ship-boarding — resolveBoarding', () => {
    it('returns damage: null on a miss', () => {
        const r = resolveBoarding({
            opposed: { attackerRoll: 80, attackerCommandTarget: 40, defenderRoll: 20, defenderCommandTarget: 50 },
            rolledCrewD5: 4,
            rolledMoraleD5: 4,
        });
        expect(r.opposed.success).toBe(false);
        expect(r.damage).toBeNull();
    });

    it('returns damage: null when boarders are lost (defender +3 DoS)', () => {
        const r = resolveBoarding({
            opposed: { attackerRoll: 60, attackerCommandTarget: 60, defenderRoll: 10, defenderCommandTarget: 50 },
            rolledCrewD5: 3,
            rolledMoraleD5: 3,
        });
        expect(r.opposed.boardersLost).toBe(true);
        expect(r.damage).toBeNull();
    });

    it('computes the full damage payload on a successful breach', () => {
        const r = resolveBoarding({
            opposed: { attackerRoll: 10, attackerCommandTarget: 60, defenderRoll: 80, defenderCommandTarget: 50 },
            rolledCrewD5: 2,
            rolledMoraleD5: 5,
        });
        expect(r.opposed.success).toBe(true);
        expect(r.opposed.netDoS).toBe(6); // 6 DoS attacker, 0 defender
        expect(r.damage).not.toBeNull();
        expect(r.damage?.hullDamage).toBe(6);
        expect(r.damage?.crewDamage).toBe(2);
        expect(r.damage?.moraleDamage).toBe(5);
    });
});
