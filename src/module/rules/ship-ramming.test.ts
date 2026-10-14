import { describe, expect, it } from 'vitest';
import { HARD_DIFFICULTY_KEY, MANOEUVRABILITY_KEY, resolveShipTest, type ShipAssaultShip } from './ship-assault';
import { composeRammingTest, computeRammingDamage, RAMMING_DIFFICULTY, RAMMING_KEYS, ramDamageFormula, type RammingProfile } from './ship-ramming';

/**
 * RT Ramming pins (#188 — RT Core p.215).
 *
 * Regression guards for the RAW corrections: the previous resolver made the
 * ram an OPPOSED Pilot test, dealt 1d10 + attacker Speed, and subtracted each
 * side's armour from the hit. RAW is an unopposed Hard (−20) Pilot +
 * Manoeuvrability test; the rammed ship takes the hull-size die + the rammer's
 * prow armour; the rammer takes the defender's Armour + 1d5; void shields are
 * ignored and armour does not reduce either hit.
 */

const RAMMER: ShipAssaultShip = {
    name: 'Errant Vector',
    hullType: 'frigate',
    manoeuvrability: 15,
    crippledManoeuvrability: 0,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 75,
};
const TARGET: ShipAssaultShip = { ...RAMMER, name: 'Whispering Star', hullType: 'raider', armour: 16 };

const PROFILE: RammingProfile = {
    damage: [
        { hullType: 'raider', formula: '1d5' },
        { hullType: 'frigate', formula: '1d10' },
        { hullType: 'cruiser', formula: '2d10' },
    ],
    reboundDamage: '1d5',
};

describe('ship-ramming — test', () => {
    it('is an unopposed Hard (−20) Pilot + Manoeuvrability test', () => {
        expect(RAMMING_DIFFICULTY).toBe(-20);
        const derivation = composeRammingTest({ pilotSkill: 40, ship: RAMMER });
        expect(derivation.modifiers.map((m) => [m.labelKey, m.value])).toEqual([
            [MANOEUVRABILITY_KEY, 15],
            [HARD_DIFFICULTY_KEY, -20],
        ]);
        expect(derivation.target).toBe(35);
        expect(resolveShipTest(derivation, 35, 'gen1').success).toBe(true);
        expect(resolveShipTest(derivation, 36, 'gen1').success).toBe(false);
    });

    it('stacks a situational bonus such as a Ram Ship', () => {
        expect(composeRammingTest({ pilotSkill: 40, ship: RAMMER, situational: { value: 20, label: 'WAAAGH!' } }).target).toBe(55);
    });
});

describe('ship-ramming — hull-size damage table', () => {
    it('reads the die for the rammer hull type from the authored table', () => {
        expect(ramDamageFormula(PROFILE, 'frigate')).toBe('1d10');
        expect(ramDamageFormula(PROFILE, 'cruiser')).toBe('2d10');
    });

    it('returns null for a hull type the table does not cover', () => {
        expect(ramDamageFormula(PROFILE, 'battlecruiser')).toBeNull();
    });
});

describe('ship-ramming — collision damage', () => {
    it('adds the die to the rammer prow armour, unreduced by the defender armour', () => {
        const damage = computeRammingDamage({
            attacker: RAMMER,
            defender: TARGET,
            damage: { formula: '1d10', total: 7 },
            rebound: { formula: '1d5', total: 3 },
        });
        expect(damage.defender.total).toBe(25);
        expect(damage.defender.components.map((c) => c.labelKey)).toEqual([RAMMING_KEYS.damageDie, RAMMING_KEYS.prowArmour]);
    });

    it('rebounds the defender Armour + 1d5 onto the rammer', () => {
        const damage = computeRammingDamage({
            attacker: RAMMER,
            defender: TARGET,
            damage: { formula: '1d10', total: 7 },
            rebound: { formula: '1d5', total: 3 },
        });
        expect(damage.attacker.total).toBe(19);
        expect(damage.attacker.components.map((c) => [c.labelKey, c.value])).toEqual([
            [RAMMING_KEYS.defenderArmour, 16],
            [RAMMING_KEYS.reboundDie, 3],
        ]);
    });

    it('adds a rolled component bonus as its own provenance row', () => {
        const damage = computeRammingDamage({
            attacker: RAMMER,
            defender: TARGET,
            damage: { formula: '1d10', total: 7 },
            rebound: { formula: '1d5', total: 3 },
            bonus: { formula: '1d10', total: 6, label: 'Power Ram' },
        });
        expect(damage.defender.total).toBe(31);
        expect(damage.defender.components.at(-1)).toEqual({ labelKey: RAMMING_KEYS.bonus, value: 6, data: { formula: '1d10', label: 'Power Ram' } });
    });
});
