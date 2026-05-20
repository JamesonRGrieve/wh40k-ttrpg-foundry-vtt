import { describe, expect, it } from 'vitest';
import { WITHOUT_HOMEWORLDS, getWithoutHomeworld, listWithoutHomeworlds } from './without-homeworlds';

/**
 * Contract tests for the Without-supplement new home-world registry
 * (without.md p. 27-32, GitHub issue #102).
 *
 * Pins the RAW values for Death World, Garden World, and Research
 * Station — characteristic mods, Fate threshold (base + Emperor's
 * Blessing trigger), wounds tuple, aptitude, key talents, mechanical
 * hooks, and the riders (Death World surprise-bonus suppression,
 * Garden World Serenity duration / Insanity-XP, Research Station
 * Pursuit-of-Data scholastic-to-forbidden advancement). Drift here
 * means a RAW regression.
 */

describe('WITHOUT_HOMEWORLDS registry shape', () => {
    it('exposes the three Without home-worlds keyed by id', () => {
        expect(Object.keys(WITHOUT_HOMEWORLDS).sort()).toEqual(['deathWorld', 'gardenWorld', 'researchStation']);
    });

    it('every entry declares the required fields', () => {
        for (const def of Object.values(WITHOUT_HOMEWORLDS)) {
            expect(def.id).toBeTruthy();
            expect(def.label).toMatch(/^WH40K\.WithoutHomeworld\./);
            expect(def.characteristicMods.bonuses.length).toBeGreaterThan(0);
            expect(def.characteristicMods.penalties.length).toBeGreaterThan(0);
            expect(def.fateThreshold.base).toBeGreaterThanOrEqual(2);
            expect(def.fateThreshold.base).toBeLessThanOrEqual(3);
            expect(def.fateThreshold.emperorsBlessing).toBeGreaterThanOrEqual(2);
            expect(def.fateThreshold.emperorsBlessing).toBeLessThanOrEqual(10);
            expect(def.wounds.dieFaces).toBe(5);
            expect(def.wounds.base).toBeGreaterThan(0);
            expect(def.aptitude.length).toBeGreaterThan(0);
            expect(def.keyTalents.length).toBeGreaterThan(0);
            expect(def.recommendedBackgrounds.length).toBeGreaterThan(0);
            expect(def.mechanicalHook.length).toBeGreaterThan(20);
        }
    });

    it('listWithoutHomeworlds returns all three definitions in a stable order', () => {
        const list = listWithoutHomeworlds();
        expect(list.map((d) => d.id)).toEqual(['deathWorld', 'gardenWorld', 'researchStation']);
    });

    it('getWithoutHomeworld returns the definition by id', () => {
        expect(getWithoutHomeworld('deathWorld')?.aptitude).toBe('Fieldcraft');
        expect(getWithoutHomeworld('gardenWorld')?.aptitude).toBe('Social');
        expect(getWithoutHomeworld('researchStation')?.aptitude).toBe('Knowledge');
    });

    it('getWithoutHomeworld returns undefined for unknown ids', () => {
        expect(getWithoutHomeworld('hiveWorld')).toBeUndefined();
        expect(getWithoutHomeworld('')).toBeUndefined();
    });
});

describe('Death World (without.md p. 27-28)', () => {
    const def = WITHOUT_HOMEWORLDS.deathWorld;

    it('grants +Ag, +Per and applies -Fel', () => {
        expect(def.characteristicMods.bonuses).toEqual(['agility', 'perception']);
        expect(def.characteristicMods.penalties).toEqual(['fellowship']);
    });

    it("uses Fate 2 with Emperor's Blessing on 5+", () => {
        expect(def.fateThreshold).toEqual({ base: 2, emperorsBlessing: 5 });
    });

    it('starts with 9 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 9, dieFaces: 5 });
    });

    it('declares the Fieldcraft aptitude', () => {
        expect(def.aptitude).toBe('Fieldcraft');
    });

    it("grants Survivor's Paranoia (suppresses +30 WS/BS Surprised bonus)", () => {
        expect(def.keyTalents.join(';')).toMatch(/Survivor/);
        expect(def.surpriseBonusSuppression).toEqual({
            suppressedBonus: 30,
            affectedSkills: ['weaponSkill', 'ballisticSkill'],
        });
    });

    it('declares no Serenity rider and no Pursuit-of-Data rider', () => {
        expect(def.serenityRider).toBeUndefined();
        expect(def.pursuitOfDataRider).toBeUndefined();
    });
});

describe('Garden World (without.md p. 29-30)', () => {
    const def = WITHOUT_HOMEWORLDS.gardenWorld;

    it('grants +Fel, +Ag and applies -T', () => {
        expect(def.characteristicMods.bonuses).toEqual(['fellowship', 'agility']);
        expect(def.characteristicMods.penalties).toEqual(['toughness']);
    });

    it("uses Fate 2 with Emperor's Blessing on 4+", () => {
        expect(def.fateThreshold).toEqual({ base: 2, emperorsBlessing: 4 });
    });

    it('starts with 7 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 7, dieFaces: 5 });
    });

    it('declares the Social aptitude', () => {
        expect(def.aptitude).toBe('Social');
    });

    it('grants Serenity of the Green (Shock/Trauma halved rounded up, Insanity 50xp)', () => {
        expect(def.keyTalents.join(';')).toMatch(/Serenity/);
        expect(def.serenityRider).toEqual({
            durationMultiplier: 0.5,
            rounding: 'up',
            insanityRemovalCost: 50,
            baselineInsanityRemovalCost: 100,
        });
    });

    it('mentions Shock/Trauma duration and Insanity removal in the mechanical hook', () => {
        const hook = def.mechanicalHook.toLowerCase();
        expect(hook).toMatch(/shock|trauma/);
        expect(hook).toMatch(/insanity/);
        expect(hook).toMatch(/50/);
    });

    it('declares no surprise-bonus suppression and no Pursuit-of-Data rider', () => {
        expect(def.surpriseBonusSuppression).toBeUndefined();
        expect(def.pursuitOfDataRider).toBeUndefined();
    });
});

describe('Research Station (without.md p. 31-32)', () => {
    const def = WITHOUT_HOMEWORLDS.researchStation;

    it('grants +Int, +Per and applies -Fel', () => {
        expect(def.characteristicMods.bonuses).toEqual(['intelligence', 'perception']);
        expect(def.characteristicMods.penalties).toEqual(['fellowship']);
    });

    it("uses Fate 3 with Emperor's Blessing on 8+", () => {
        expect(def.fateThreshold).toEqual({ base: 3, emperorsBlessing: 8 });
    });

    it('starts with 8 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 8, dieFaces: 5 });
    });

    it('declares the Knowledge aptitude', () => {
        expect(def.aptitude).toBe('Knowledge');
    });

    it('grants Pursuit of Data (Scholastic Rank 2 -> Forbidden Rank 1, related)', () => {
        expect(def.keyTalents.join(';')).toMatch(/Pursuit of Data/);
        expect(def.pursuitOfDataRider).toEqual({
            triggerScholasticRank: 2,
            grantedForbiddenRank: 1,
            requiresRelatedSpecialisation: true,
        });
    });

    it('mentions Scholastic Lore and Forbidden Lore in the mechanical hook', () => {
        const hook = def.mechanicalHook.toLowerCase();
        expect(hook).toMatch(/scholastic lore/);
        expect(hook).toMatch(/forbidden lore/);
    });

    it('declares no surprise-bonus suppression and no Serenity rider', () => {
        expect(def.surpriseBonusSuppression).toBeUndefined();
        expect(def.serenityRider).toBeUndefined();
    });
});
