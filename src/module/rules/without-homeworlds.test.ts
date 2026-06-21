import { describe, expect, it } from 'vitest';
import { WITHOUT_HOMEWORLDS, getWithoutHomeworld, listWithoutHomeworlds } from './without-homeworlds';

/**
 * Contract tests for the slimmed Without-supplement home-world registry
 * (without.md p. 27-32, GitHub issues #102 / #338).
 *
 * Per Direction #7, the basic mechanical values (characteristic mods, Fate
 * threshold, wounds, aptitude) now live in the compendium and are pinned by
 * `homeworld-compendium.test.ts`. This suite pins what the registry still
 * owns: the `compendiumId` join key, the structured riders (Death World
 * surprise-bonus suppression, Garden World Serenity duration / Insanity-XP,
 * Research Station Pursuit-of-Data advancement), and the prose fields.
 */

describe('WITHOUT_HOMEWORLDS registry shape', () => {
    it('exposes the three Without home-worlds keyed by id', () => {
        expect(Object.keys(WITHOUT_HOMEWORLDS).sort()).toEqual(['deathWorld', 'gardenWorld', 'researchStation']);
    });

    it('every entry declares the required slimmed fields', () => {
        for (const def of Object.values(WITHOUT_HOMEWORLDS)) {
            expect(def.id).toBeTruthy();
            expect(def.compendiumId).toMatch(/^[a-z]+(-[a-z]+)*$/);
            expect(def.label).toMatch(/^WH40K\.WithoutHomeworld\./);
            expect(def.keyTalents.length).toBeGreaterThan(0);
            expect(def.recommendedBackgrounds.length).toBeGreaterThan(0);
            expect(def.mechanicalHook.length).toBeGreaterThan(20);
        }
    });

    it('joins each registry id to its kebab-case compendium identifier', () => {
        expect(WITHOUT_HOMEWORLDS.deathWorld.compendiumId).toBe('death-world');
        expect(WITHOUT_HOMEWORLDS.gardenWorld.compendiumId).toBe('garden-world');
        expect(WITHOUT_HOMEWORLDS.researchStation.compendiumId).toBe('research-station');
    });

    it('listWithoutHomeworlds returns all three definitions in a stable order', () => {
        const list = listWithoutHomeworlds();
        expect(list.map((d) => d.id)).toEqual(['deathWorld', 'gardenWorld', 'researchStation']);
    });

    it('getWithoutHomeworld returns the definition by id', () => {
        expect(getWithoutHomeworld('deathWorld')?.compendiumId).toBe('death-world');
        expect(getWithoutHomeworld('gardenWorld')?.compendiumId).toBe('garden-world');
        expect(getWithoutHomeworld('researchStation')?.compendiumId).toBe('research-station');
    });

    it('getWithoutHomeworld returns undefined for unknown ids', () => {
        expect(getWithoutHomeworld('hiveWorld')).toBeUndefined();
        expect(getWithoutHomeworld('')).toBeUndefined();
    });
});

describe('Death World (without.md p. 27-28)', () => {
    const def = WITHOUT_HOMEWORLDS.deathWorld;

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
