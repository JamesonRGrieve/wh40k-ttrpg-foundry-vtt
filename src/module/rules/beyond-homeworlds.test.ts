import { describe, expect, it } from 'vitest';
import { BEYOND_HOMEWORLDS, getBeyondHomeworld, listBeyondHomeworlds } from './beyond-homeworlds';

/**
 * Contract tests for the slimmed Beyond-supplement home-world registry
 * (beyond.md p. 26-31, GitHub issues #140 / #338).
 *
 * Per Direction #7, the basic mechanical values (characteristic mods, Fate
 * threshold, wounds, aptitude) now live in the compendium and are pinned by
 * `homeworld-compendium.test.ts`. This suite pins what the registry still
 * owns: the `compendiumId` join key, the structured riders (Daemon World
 * corruption, Quarantine World subtlety clamp), and the key-talent /
 * recommended-background / mechanical-hook prose.
 */

describe('BEYOND_HOMEWORLDS registry shape', () => {
    it('exposes the three Beyond home-worlds keyed by id', () => {
        expect(Object.keys(BEYOND_HOMEWORLDS).sort()).toEqual(['daemonWorld', 'penalColony', 'quarantineWorld']);
    });

    it('every entry declares the required slimmed fields', () => {
        for (const def of Object.values(BEYOND_HOMEWORLDS)) {
            expect(def.id).toBeTruthy();
            expect(def.compendiumId).toMatch(/^[a-z]+(-[a-z]+)*$/);
            expect(def.label).toMatch(/^WH40K\.BeyondHomeworld\./);
            expect(def.keyTalents.length).toBeGreaterThan(0);
            expect(def.recommendedBackgrounds.length).toBeGreaterThan(0);
            expect(def.mechanicalHook.length).toBeGreaterThan(20);
        }
    });

    it('joins each registry id to its kebab-case compendium identifier', () => {
        expect(BEYOND_HOMEWORLDS.daemonWorld.compendiumId).toBe('daemon-world');
        expect(BEYOND_HOMEWORLDS.penalColony.compendiumId).toBe('penal-colony');
        expect(BEYOND_HOMEWORLDS.quarantineWorld.compendiumId).toBe('quarantine-world');
    });

    it('listBeyondHomeworlds returns all three definitions in a stable order', () => {
        const list = listBeyondHomeworlds();
        expect(list.map((d) => d.id)).toEqual(['daemonWorld', 'penalColony', 'quarantineWorld']);
    });

    it('getBeyondHomeworld returns the definition by id', () => {
        expect(getBeyondHomeworld('daemonWorld')?.compendiumId).toBe('daemon-world');
        expect(getBeyondHomeworld('penalColony')?.compendiumId).toBe('penal-colony');
        expect(getBeyondHomeworld('quarantineWorld')?.compendiumId).toBe('quarantine-world');
    });

    it('getBeyondHomeworld returns undefined for unknown ids', () => {
        expect(getBeyondHomeworld('hiveWorld')).toBeUndefined();
        expect(getBeyondHomeworld('')).toBeUndefined();
    });
});

describe('Daemon World (beyond.md p. 26-27)', () => {
    const def = BEYOND_HOMEWORLDS.daemonWorld;

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
