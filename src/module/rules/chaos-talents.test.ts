import { describe, expect, it } from 'vitest';
import {
    AEGIS_OF_CONTEMPT,
    DIVINE_PROTECTION,
    FLAGELLANT,
    INDOMITABLE_CONVICTION,
    INTO_THE_JAWS_OF_HELL,
    MOUNTED_WARRIOR,
    PENITENT_PSYKER,
    PURITY_OF_HATRED,
    TAINTED_PSYKER,
    WITCH_FINDER,
} from './chaos-talents';

/**
 * Contract tests for the within-supplement novel-mechanic talents
 * (#95 — within.md p.57-58). Each constant encodes the per-talent
 * numbers the engine consumer needs; this commit pins them so a
 * future refactor cannot drift the values.
 *
 * Tainted Psyker's `phenomenaModifierPerCp` (5) composes with the
 * `phenomena-modifier.ts` composer added under #137.
 */
describe('Chaos talents — within.md p.57-58 (#95)', () => {
    it('Aegis of Contempt: 10m aura, 1 Corruption reduction per event', () => {
        expect(AEGIS_OF_CONTEMPT.radiusMetres).toBe(10);
        expect(AEGIS_OF_CONTEMPT.corruptionReduction).toBe(1);
    });

    it('Indomitable Conviction: 10m aura, 1 Insanity reduction', () => {
        expect(INDOMITABLE_CONVICTION.radiusMetres).toBe(10);
        expect(INDOMITABLE_CONVICTION.insanityReduction).toBe(1);
    });

    it('Into the Jaws of Hell: 10m aura (Fellowship bonus subtracted from ally DoF by caller)', () => {
        expect(INTO_THE_JAWS_OF_HELL.radiusMetres).toBe(10);
    });

    it('Divine Protection prereqs: BS 45 + WP 35', () => {
        expect(DIVINE_PROTECTION.requiresBS).toBe(45);
        expect(DIVINE_PROTECTION.requiresWP).toBe(35);
    });

    it('Flagellant: 1d5-2 self-Fatigue for +10 WP for 60 rounds (~1 hour)', () => {
        expect(FLAGELLANT.fatigueCostFormula).toBe('1d5-2');
        expect(FLAGELLANT.wpBonus).toBe(10);
        expect(FLAGELLANT.durationRounds).toBe(60);
    });

    it('Mounted Warrior: 10 penalty reduction per rank', () => {
        expect(MOUNTED_WARRIOR.penaltyReductionPerRank).toBe(10);
    });

    it('Penitent Psyker: +10 ally resistance + phenomena-on-doubles trigger', () => {
        expect(PENITENT_PSYKER.allyResistanceBonus).toBe(10);
        expect(PENITENT_PSYKER.triggersPhenomenaOnDoubles).toBe(true);
    });

    it('Purity of Hatred: grants Vengeful (9) on Hatred targets', () => {
        expect(PURITY_OF_HATRED.grantedVengefulThreshold).toBe(9);
    });

    it('Tainted Psyker: +10/CP test target, +5/CP phenomena modifier', () => {
        expect(TAINTED_PSYKER.testBonusPerCp).toBe(10);
        expect(TAINTED_PSYKER.phenomenaModifierPerCp).toBe(5);
    });

    it('Witch Finder: pseudo-Psyniscience rank 1 for non-psykers', () => {
        expect(WITCH_FINDER.pseudoSkillRank).toBe(1);
    });
});
