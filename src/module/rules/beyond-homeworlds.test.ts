import { describe, expect, it } from 'vitest';
import {
    BEYOND_HOMEWORLDS,
    getBeyondHomeworld,
    listBeyondHomeworlds,
} from './beyond-homeworlds';

/**
 * Contract tests for the Beyond-supplement new home-world registry
 * (beyond.md p. 26-31, GitHub issue #140).
 *
 * Pins the RAW values for Daemon World, Penal Colony, and Quarantine
 * World — characteristic mods, Fate threshold (base + Emperor's
 * Blessing trigger), wounds tuple, aptitude, key talents, mechanical
 * hooks, and the riders (Daemon World corruption, Quarantine World
 * subtlety clamp). Drift here means a RAW regression.
 */

describe('BEYOND_HOMEWORLDS registry shape', () => {
    it('exposes the three Beyond home-worlds keyed by id', () => {
        expect(Object.keys(BEYOND_HOMEWORLDS).sort()).toEqual(['daemonWorld', 'penalColony', 'quarantineWorld']);
    });

    it('every entry declares the required fields', () => {
        for (const def of Object.values(BEYOND_HOMEWORLDS)) {
            expect(def.id).toBeTruthy();
            expect(def.label).toMatch(/^WH40K\.BeyondHomeworld\./);
            expect(def.characteristicMods.bonuses.length).toBeGreaterThan(0);
            expect(def.characteristicMods.penalties.length).toBeGreaterThan(0);
            expect(def.fateThreshold.base).toBe(3);
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

    it('listBeyondHomeworlds returns all three definitions in a stable order', () => {
        const list = listBeyondHomeworlds();
        expect(list.map((d) => d.id)).toEqual(['daemonWorld', 'penalColony', 'quarantineWorld']);
    });

    it('getBeyondHomeworld returns the definition by id', () => {
        expect(getBeyondHomeworld('daemonWorld')?.aptitude).toBe('Willpower');
        expect(getBeyondHomeworld('penalColony')?.aptitude).toBe('Toughness');
        expect(getBeyondHomeworld('quarantineWorld')?.aptitude).toBe('Fieldcraft');
    });

    it('getBeyondHomeworld returns undefined for unknown ids', () => {
        expect(getBeyondHomeworld('hiveWorld')).toBeUndefined();
        expect(getBeyondHomeworld('')).toBeUndefined();
    });
});

describe('Daemon World (beyond.md p. 26-27)', () => {
    const def = BEYOND_HOMEWORLDS.daemonWorld;

    it('grants +WP, +Per and applies -Fel', () => {
        expect(def.characteristicMods.bonuses).toEqual(['willpower', 'perception']);
        expect(def.characteristicMods.penalties).toEqual(['fellowship']);
    });

    it("uses Fate 3 with Emperor's Blessing on 4+", () => {
        expect(def.fateThreshold).toEqual({ base: 3, emperorsBlessing: 4 });
    });

    it('starts with 7 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 7, dieFaces: 5 });
    });

    it('declares the Willpower aptitude', () => {
        expect(def.aptitude).toBe('Willpower');
    });

    it('grants Touched by the Warp (Psyniscience)', () => {
        expect(def.keyTalents.join(';')).toMatch(/Psyniscience/);
    });

    it('starts with 1d10 + 5 Corruption Points', () => {
        expect(def.corruptionRider).toEqual({ base: 5, dieFaces: 10 });
    });

    it('does not declare a subtlety clamp', () => {
        expect(def.subtletyClamp).toBeUndefined();
    });
});

describe('Penal Colony (beyond.md p. 28-29)', () => {
    const def = BEYOND_HOMEWORLDS.penalColony;

    it('grants +T, +Per and applies -Inf', () => {
        expect(def.characteristicMods.bonuses).toEqual(['toughness', 'perception']);
        expect(def.characteristicMods.penalties).toEqual(['influence']);
    });

    it("uses Fate 3 with Emperor's Blessing on 8+", () => {
        expect(def.fateThreshold).toEqual({ base: 3, emperorsBlessing: 8 });
    });

    it('starts with 10 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 10, dieFaces: 5 });
    });

    it('declares the Toughness aptitude', () => {
        expect(def.aptitude).toBe('Toughness');
    });

    it('grants Finger on the Pulse (CL Underworld, Scrutiny, Peer (Criminal Cartels))', () => {
        const joined = def.keyTalents.join(';');
        expect(joined).toMatch(/Underworld/);
        expect(joined).toMatch(/Scrutiny/);
        expect(joined).toMatch(/Peer \(Criminal Cartels\)/);
    });

    it('declares no Corruption rider and no subtlety clamp', () => {
        expect(def.corruptionRider).toBeUndefined();
        expect(def.subtletyClamp).toBeUndefined();
    });
});

describe('Quarantine World (beyond.md p. 30-31)', () => {
    const def = BEYOND_HOMEWORLDS.quarantineWorld;

    it('grants +BS, +Int and applies -S', () => {
        expect(def.characteristicMods.bonuses).toEqual(['ballisticSkill', 'intelligence']);
        expect(def.characteristicMods.penalties).toEqual(['strength']);
    });

    it("uses Fate 3 with Emperor's Blessing on 9+", () => {
        expect(def.fateThreshold).toEqual({ base: 3, emperorsBlessing: 9 });
    });

    it('starts with 8 + 1d5 wounds', () => {
        expect(def.wounds).toEqual({ base: 8, dieFaces: 5 });
    });

    it('declares the Fieldcraft aptitude', () => {
        expect(def.aptitude).toBe('Fieldcraft');
    });

    it('declares the Secretive by Nature subtlety clamp (-2, min reduction 1)', () => {
        expect(def.subtletyClamp).toEqual({ reducedBy: 2, minimumReduction: 1 });
    });

    it('mentions the contamination / mutation rider in the mechanical hook', () => {
        expect(def.mechanicalHook.toLowerCase()).toMatch(/subtlety/);
        expect(def.mechanicalHook.toLowerCase()).toMatch(/contamination|mutation|quarantine/);
    });

    it('declares no Corruption rider', () => {
        expect(def.corruptionRider).toBeUndefined();
    });
});
