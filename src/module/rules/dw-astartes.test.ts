import { describe, expect, it } from 'vitest';
import {
    ASTARTES_IMPLANTS,
    IMPLANT_EFFECTS,
    UNNATURAL_STRENGTH_MULTIPLIER,
    UNNATURAL_TOUGHNESS_MULTIPLIER,
    astartesStrengthBonus,
    astartesToughnessBonus,
    hasBlackCarapace,
    powerArmorInterfaceActive,
    type AstartesImplantId,
} from './dw-astartes.ts';

/**
 * Pure-rules tests for the Deathwatch Astartes baseline (#167):
 * 19-implant registry, Unnatural Str/Toughness ×2 math, and the Black
 * Carapace → power-armour interface gate.
 */

/* -------------------------------------------- */
/*  Implant registry                            */
/* -------------------------------------------- */

describe('ASTARTES_IMPLANTS', () => {
    it('lists exactly 19 canonical implants', () => {
        expect(ASTARTES_IMPLANTS).toHaveLength(19);
    });

    it('contains every implant id from the RAW table', () => {
        const expected: AstartesImplantId[] = [
            'secondary-heart',
            'ossmodula',
            'biscopea',
            'haemastamen',
            'larramans-organ',
            'catalepsean-node',
            'preomnor',
            'omophagea',
            'multi-lung',
            'occulobe',
            'lymans-ear',
            'sus-an-membrane',
            'melanchromic-organ',
            'oolitic-kidney',
            'neuroglottis',
            'mucranoid',
            'betchers-gland',
            'progenoids',
            'black-carapace',
        ];
        for (const id of expected) {
            expect(ASTARTES_IMPLANTS).toContain(id);
        }
    });

    it('has no duplicate identifiers', () => {
        const seen = new Set<AstartesImplantId>(ASTARTES_IMPLANTS);
        expect(seen.size).toBe(ASTARTES_IMPLANTS.length);
    });
});

describe('IMPLANT_EFFECTS', () => {
    it('declares an effect entry for every implant id', () => {
        for (const id of ASTARTES_IMPLANTS) {
            expect(IMPLANT_EFFECTS[id]).toBeDefined();
        }
    });

    it('each entry has a non-empty English description', () => {
        for (const id of ASTARTES_IMPLANTS) {
            const entry = IMPLANT_EFFECTS[id];
            expect(entry.id).toBe(id);
            expect(typeof entry.description).toBe('string');
            expect(entry.description.length).toBeGreaterThan(0);
        }
    });

    it("classifies Larraman's Organ as auto-heal", () => {
        expect(IMPLANT_EFFECTS['larramans-organ'].mechanic).toBe('auto-heal');
    });

    it('classifies the Sus-an Membrane as suspended-animation', () => {
        expect(IMPLANT_EFFECTS['sus-an-membrane'].mechanic).toBe('immune-suspended-animation');
    });

    it('classifies the Black Carapace as the power-armour interface', () => {
        expect(IMPLANT_EFFECTS['black-carapace'].mechanic).toBe('power-armor-interface');
    });

    it("classifies Betcher's Gland as spit-acid", () => {
        expect(IMPLANT_EFFECTS['betchers-gland'].mechanic).toBe('spit-acid');
    });

    it('classifies the Progenoids as the gene-seed organ', () => {
        expect(IMPLANT_EFFECTS.progenoids.mechanic).toBe('gene-seed-organ');
    });

    it('omits `mechanic` for the three Unnatural-feeding implants', () => {
        expect(IMPLANT_EFFECTS.ossmodula.mechanic).toBeUndefined();
        expect(IMPLANT_EFFECTS.biscopea.mechanic).toBeUndefined();
        expect(IMPLANT_EFFECTS.haemastamen.mechanic).toBeUndefined();
    });
});

/* -------------------------------------------- */
/*  Unnatural Str/Toughness multipliers         */
/* -------------------------------------------- */

describe('Unnatural Characteristic multipliers', () => {
    it('exposes ×2 for both Strength and Toughness', () => {
        expect(UNNATURAL_STRENGTH_MULTIPLIER).toBe(2);
        expect(UNNATURAL_TOUGHNESS_MULTIPLIER).toBe(2);
    });

    it('doubles a positive Strength Bonus', () => {
        expect(astartesStrengthBonus(4)).toBe(8);
        expect(astartesStrengthBonus(5)).toBe(10);
        expect(astartesStrengthBonus(1)).toBe(2);
    });

    it('doubles a positive Toughness Bonus', () => {
        expect(astartesToughnessBonus(4)).toBe(8);
        expect(astartesToughnessBonus(7)).toBe(14);
    });

    it('floors a zero or negative Strength Bonus at zero', () => {
        expect(astartesStrengthBonus(0)).toBe(0);
        expect(astartesStrengthBonus(-3)).toBe(0);
    });

    it('floors a zero or negative Toughness Bonus at zero', () => {
        expect(astartesToughnessBonus(0)).toBe(0);
        expect(astartesToughnessBonus(-2)).toBe(0);
    });

    it('returns 0 for non-finite inputs rather than NaN', () => {
        expect(astartesStrengthBonus(Number.NaN)).toBe(0);
        expect(astartesToughnessBonus(Number.POSITIVE_INFINITY)).toBe(0);
        expect(astartesToughnessBonus(Number.NEGATIVE_INFINITY)).toBe(0);
    });
});

/* -------------------------------------------- */
/*  Black Carapace / power-armour interface     */
/* -------------------------------------------- */

describe('hasBlackCarapace', () => {
    it('returns true when the implant array contains the carapace', () => {
        expect(hasBlackCarapace(['secondary-heart', 'black-carapace'])).toBe(true);
        expect(hasBlackCarapace([...ASTARTES_IMPLANTS])).toBe(true);
    });

    it('returns false when the implant array omits the carapace', () => {
        expect(hasBlackCarapace([])).toBe(false);
        expect(hasBlackCarapace(['secondary-heart', 'ossmodula', 'progenoids'])).toBe(false);
    });
});

describe('powerArmorInterfaceActive', () => {
    it('is false when the actor lacks the Black Carapace', () => {
        expect(
            powerArmorInterfaceActive({
                implants: ['secondary-heart', 'ossmodula'],
                wearingAstartesPowerArmor: true,
            }),
        ).toBe(false);
    });

    it('is false when the actor has the carapace but is not wearing Astartes PA', () => {
        expect(
            powerArmorInterfaceActive({
                implants: ['black-carapace'],
                wearingAstartesPowerArmor: false,
            }),
        ).toBe(false);
    });

    it('is true when both signals are present', () => {
        expect(
            powerArmorInterfaceActive({
                implants: [...ASTARTES_IMPLANTS],
                wearingAstartesPowerArmor: true,
            }),
        ).toBe(true);
    });

    it('is false when neither signal is present', () => {
        expect(
            powerArmorInterfaceActive({
                implants: [],
                wearingAstartesPowerArmor: false,
            }),
        ).toBe(false);
    });
});
