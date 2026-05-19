import { describe, expect, it } from 'vitest';
import {
    computeRammingDamage,
    degreesOfSuccess,
    RAMMING_RESOLUTION_FAVORS_DEFENDER,
    resolveRamming,
    resolveRammingToHit,
} from './ship-ramming';

/**
 * RT Ramming resolver pins (#188 — core.md L9997 §Ramming and Boarding
 * Actions, +1d10 prow bonuses at L9453 / L9778).
 *
 * The tests pin:
 *   - DoS math at the boundary (exact pass, 1-DoS step, complete miss).
 *   - Tie semantics (defender wins) for the opposed Pilot test.
 *   - Damage math with and without the Imposing / Good an' Ard +1d10.
 *   - Armour subtraction floors at 0 on both sides.
 *   - Top-level resolver returns `damage: null` on a miss.
 */
describe('ship-ramming — invariants', () => {
    it('declares the tie-handling convention explicitly', () => {
        expect(RAMMING_RESOLUTION_FAVORS_DEFENDER).toBe(true);
    });
});

describe('ship-ramming — degrees of success', () => {
    it('returns 0 when the roll exceeds the target', () => {
        expect(degreesOfSuccess(75, 40)).toBe(0);
    });

    it('returns 1 on a bare pass', () => {
        expect(degreesOfSuccess(40, 40)).toBe(1);
    });

    it('returns 1 per full 10 the roll beats the target by', () => {
        expect(degreesOfSuccess(30, 40)).toBe(2);
        expect(degreesOfSuccess(11, 40)).toBe(3);
        expect(degreesOfSuccess(1, 40)).toBe(4);
    });
});

describe('ship-ramming — resolveRammingToHit', () => {
    it('attacker wins when they pass and defender fails', () => {
        const r = resolveRammingToHit({ attackerRoll: 30, attackerTarget: 50, defenderRoll: 75, defenderTarget: 40 });
        expect(r.success).toBe(true);
        expect(r.attackerDoS).toBe(3);
        expect(r.defenderDoS).toBe(0);
        expect(r.netDoS).toBe(3);
    });

    it('attacker loses when defender scores more DoS', () => {
        const r = resolveRammingToHit({ attackerRoll: 35, attackerTarget: 40, defenderRoll: 10, defenderTarget: 40 });
        expect(r.success).toBe(false);
        expect(r.attackerDoS).toBe(1);
        expect(r.defenderDoS).toBe(4);
        expect(r.netDoS).toBe(-3);
    });

    it('tie favours the defender (success === false on equal DoS)', () => {
        const r = resolveRammingToHit({ attackerRoll: 30, attackerTarget: 50, defenderRoll: 30, defenderTarget: 50 });
        expect(r.attackerDoS).toBe(r.defenderDoS);
        expect(r.netDoS).toBe(0);
        expect(r.success).toBe(false);
    });

    it('both-fail still routes to defender', () => {
        const r = resolveRammingToHit({ attackerRoll: 90, attackerTarget: 40, defenderRoll: 95, defenderTarget: 40 });
        expect(r.attackerDoS).toBe(0);
        expect(r.defenderDoS).toBe(0);
        expect(r.success).toBe(false);
    });
});

describe('ship-ramming — computeRammingDamage', () => {
    it('rolls (1d10 + Speed) through armour on both sides', () => {
        const dmg = computeRammingDamage({
            rolledD10: 7,
            attackerSpeed: 4,
            defenderArmour: 13,
            attackerArmour: 18,
        });
        expect(dmg.defender.raw).toBe(11);
        expect(dmg.defender.armour).toBe(13);
        expect(dmg.defender.hullDamage).toBe(0); // 11 − 13 floors at 0
        expect(dmg.attacker.raw).toBe(11);
        expect(dmg.attacker.armour).toBe(18);
        expect(dmg.attacker.hullDamage).toBe(0);
        expect(dmg.bonusDamage).toBe(0);
    });

    it('applies Imposing / Good an Ard +1d10 when attackerExtraRamDamage is set', () => {
        const dmg = computeRammingDamage({
            rolledD10: 6,
            attackerSpeed: 6,
            defenderArmour: 14,
            attackerArmour: 16,
            attackerExtraRamDamage: true,
            bonusRolledD10: 9,
        });
        expect(dmg.bonusDamage).toBe(9);
        expect(dmg.defender.raw).toBe(6 + 6 + 9);
        expect(dmg.defender.hullDamage).toBe(21 - 14);
        expect(dmg.attacker.raw).toBe(21);
        expect(dmg.attacker.hullDamage).toBe(21 - 16);
    });

    it('does not add the bonus die when extraRamDamage is false', () => {
        const dmg = computeRammingDamage({
            rolledD10: 8,
            attackerSpeed: 5,
            defenderArmour: 12,
            attackerArmour: 12,
            attackerExtraRamDamage: false,
            bonusRolledD10: 10, // ignored
        });
        expect(dmg.bonusDamage).toBe(0);
        expect(dmg.defender.raw).toBe(13);
        expect(dmg.defender.hullDamage).toBe(1);
        expect(dmg.attacker.hullDamage).toBe(1);
    });
});

describe('ship-ramming — resolveRamming', () => {
    it('returns null damage on a miss', () => {
        const r = resolveRamming({
            toHit: { attackerRoll: 80, attackerTarget: 40, defenderRoll: 30, defenderTarget: 50 },
            damage: { rolledD10: 8, attackerSpeed: 6, defenderArmour: 14, attackerArmour: 16 },
        });
        expect(r.toHit.success).toBe(false);
        expect(r.damage).toBeNull();
    });

    it('computes the damage payload on a hit', () => {
        const r = resolveRamming({
            toHit: { attackerRoll: 20, attackerTarget: 50, defenderRoll: 80, defenderTarget: 40 },
            damage: { rolledD10: 10, attackerSpeed: 8, defenderArmour: 14, attackerArmour: 16 },
        });
        expect(r.toHit.success).toBe(true);
        expect(r.damage).not.toBeNull();
        expect(r.damage?.defender.hullDamage).toBe(18 - 14);
        expect(r.damage?.attacker.hullDamage).toBe(18 - 16);
    });
});
