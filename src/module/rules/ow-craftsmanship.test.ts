import { describe, expect, it } from 'vitest';
import {
    CRAFTSMANSHIP_TIERS,
    OW_ARMOUR_CRAFTSMANSHIP,
    OW_MELEE_CRAFTSMANSHIP,
    OW_RANGED_CRAFTSMANSHIP,
    getArmourCraftsmanshipEffect,
    getMeleeCraftsmanshipEffect,
    getRangedCraftsmanshipEffect,
    type Craftsmanship,
} from './ow-craftsmanship';

/* -------------------------------------------------------------- */
/*  Tier roster                                                    */
/* -------------------------------------------------------------- */

describe('CRAFTSMANSHIP_TIERS', () => {
    it('enumerates the four RAW tiers in ascending quality order', () => {
        expect(CRAFTSMANSHIP_TIERS).toEqual(['poor', 'common', 'good', 'best']);
    });
});

/* -------------------------------------------------------------- */
/*  Ranged weapons                                                 */
/* -------------------------------------------------------------- */

describe('getRangedCraftsmanshipEffect', () => {
    it('Poor → Unreliable', () => {
        expect(getRangedCraftsmanshipEffect('poor')).toEqual({ reliabilityShift: 'unreliable' });
    });

    it('Common → standard (no reliability shift)', () => {
        expect(getRangedCraftsmanshipEffect('common')).toEqual({ reliabilityShift: 'standard' });
    });

    it('Good → Reliable', () => {
        expect(getRangedCraftsmanshipEffect('good')).toEqual({ reliabilityShift: 'reliable' });
    });

    it('Best → Never Jams', () => {
        expect(getRangedCraftsmanshipEffect('best')).toEqual({ reliabilityShift: 'never-jams' });
    });

    it('returns the frozen singleton from the OW_RANGED_CRAFTSMANSHIP table', () => {
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(getRangedCraftsmanshipEffect(tier)).toBe(OW_RANGED_CRAFTSMANSHIP[tier]);
        }
    });
});

/* -------------------------------------------------------------- */
/*  Melee weapons                                                  */
/* -------------------------------------------------------------- */

describe('getMeleeCraftsmanshipEffect', () => {
    it('Poor → -10 WS, +0 damage', () => {
        expect(getMeleeCraftsmanshipEffect('poor')).toEqual({ weaponSkillModifier: -10, damageBonus: 0 });
    });

    it('Common → 0 WS, +0 damage', () => {
        expect(getMeleeCraftsmanshipEffect('common')).toEqual({ weaponSkillModifier: 0, damageBonus: 0 });
    });

    it('Good → +5 WS, +0 damage', () => {
        expect(getMeleeCraftsmanshipEffect('good')).toEqual({ weaponSkillModifier: 5, damageBonus: 0 });
    });

    it('Best → +10 WS, +1 damage', () => {
        expect(getMeleeCraftsmanshipEffect('best')).toEqual({ weaponSkillModifier: 10, damageBonus: 1 });
    });

    it('only Best contributes a damage bonus', () => {
        const damageBonuses = CRAFTSMANSHIP_TIERS.map((tier: Craftsmanship) => getMeleeCraftsmanshipEffect(tier).damageBonus);
        expect(damageBonuses).toEqual([0, 0, 0, 1]);
    });

    it('returns the frozen singleton from the OW_MELEE_CRAFTSMANSHIP table', () => {
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(getMeleeCraftsmanshipEffect(tier)).toBe(OW_MELEE_CRAFTSMANSHIP[tier]);
        }
    });
});

/* -------------------------------------------------------------- */
/*  Armour                                                         */
/* -------------------------------------------------------------- */

describe('getArmourCraftsmanshipEffect', () => {
    it('Poor → -10 Agility, no AP / weight benefits', () => {
        expect(getArmourCraftsmanshipEffect('poor')).toEqual({
            agilityModifier: -10,
            apFirstHit: 0,
            halfWeight: false,
            flatApBonus: 0,
        });
    });

    it('Common → no modifiers', () => {
        expect(getArmourCraftsmanshipEffect('common')).toEqual({
            agilityModifier: 0,
            apFirstHit: 0,
            halfWeight: false,
            flatApBonus: 0,
        });
    });

    it('Good → +1 AP against the first hit each round', () => {
        expect(getArmourCraftsmanshipEffect('good')).toEqual({
            agilityModifier: 0,
            apFirstHit: 1,
            halfWeight: false,
            flatApBonus: 0,
        });
    });

    it('Best → half weight and +1 flat AP', () => {
        expect(getArmourCraftsmanshipEffect('best')).toEqual({
            agilityModifier: 0,
            apFirstHit: 0,
            halfWeight: true,
            flatApBonus: 1,
        });
    });

    it('only Poor imposes an Agility penalty', () => {
        const agilityMods = CRAFTSMANSHIP_TIERS.map((tier: Craftsmanship) => getArmourCraftsmanshipEffect(tier).agilityModifier);
        expect(agilityMods).toEqual([-10, 0, 0, 0]);
    });

    it('only Good grants the first-hit AP', () => {
        const firstHitAp = CRAFTSMANSHIP_TIERS.map((tier: Craftsmanship) => getArmourCraftsmanshipEffect(tier).apFirstHit);
        expect(firstHitAp).toEqual([0, 0, 1, 0]);
    });

    it('only Best halves weight and grants flat +1 AP', () => {
        const flagged = CRAFTSMANSHIP_TIERS.filter((tier: Craftsmanship) => getArmourCraftsmanshipEffect(tier).halfWeight);
        expect(flagged).toEqual(['best']);
        const flatAp = CRAFTSMANSHIP_TIERS.map((tier: Craftsmanship) => getArmourCraftsmanshipEffect(tier).flatApBonus);
        expect(flatAp).toEqual([0, 0, 0, 1]);
    });

    it('returns the frozen singleton from the OW_ARMOUR_CRAFTSMANSHIP table', () => {
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(getArmourCraftsmanshipEffect(tier)).toBe(OW_ARMOUR_CRAFTSMANSHIP[tier]);
        }
    });
});

/* -------------------------------------------------------------- */
/*  Table immutability                                             */
/* -------------------------------------------------------------- */

describe('Craftsmanship effect tables', () => {
    it('the ranged table is frozen', () => {
        expect(Object.isFrozen(OW_RANGED_CRAFTSMANSHIP)).toBe(true);
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(Object.isFrozen(OW_RANGED_CRAFTSMANSHIP[tier])).toBe(true);
        }
    });

    it('the melee table is frozen', () => {
        expect(Object.isFrozen(OW_MELEE_CRAFTSMANSHIP)).toBe(true);
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(Object.isFrozen(OW_MELEE_CRAFTSMANSHIP[tier])).toBe(true);
        }
    });

    it('the armour table is frozen', () => {
        expect(Object.isFrozen(OW_ARMOUR_CRAFTSMANSHIP)).toBe(true);
        for (const tier of CRAFTSMANSHIP_TIERS) {
            expect(Object.isFrozen(OW_ARMOUR_CRAFTSMANSHIP[tier])).toBe(true);
        }
    });
});
