/**
 * Sanctic Daemonology discipline tests (#130 — beyond.md L1813–2090).
 *
 * Covers the issue's acceptance criteria:
 *   - Sanctic power use does NOT increment corruption.
 *   - The Malefic comparison still charges PR-worth of corruption
 *     (the defining contrast is asserted from both sides).
 *   - The discipline registry surfaces Sanctic alongside Malefic.
 *   - Composition with the shared Push/Fettered/Unfettered selector
 *     and the Soul Binding / Sanctic Purity Phenomena interactions
 *     (#86 Astropath, #131 Emperor's Anathema).
 */

import { describe, expect, it } from 'vitest';
import { getMaleficCorruptionCost } from './malefic-corruption.ts';
import {
    DAEMONOLOGY_DISCIPLINES,
    SANCTIC_POWERS,
    getDaemonologyDiscipline,
    getSancticCorruptionCost,
    getSancticPower,
    isSancticDiscipline,
    resolveSancticManifestation,
} from './sanctic-daemonology.ts';

describe('DAEMONOLOGY_DISCIPLINES registry (#130 — surfaces Sanctic alongside Malefic)', () => {
    it('contains exactly the two opposed disciplines', () => {
        expect(DAEMONOLOGY_DISCIPLINES.map((d) => d.id)).toEqual(['sanctic', 'malefic']);
    });

    it('marks Sanctic as the sanctified, zero-corruption discipline', () => {
        const sanctic = getDaemonologyDiscipline('sanctic');
        expect(sanctic).not.toBeNull();
        expect(sanctic?.isSanctified).toBe(true);
        expect(sanctic?.corruptionPerPR).toBe(0);
    });

    it('marks Malefic as the heretical, 1×PR-corruption discipline', () => {
        const malefic = getDaemonologyDiscipline('malefic');
        expect(malefic?.isSanctified).toBe(false);
        expect(malefic?.corruptionPerPR).toBe(1);
    });

    it('returns null for an unknown discipline id', () => {
        // @ts-expect-error -- intentionally passing an out-of-union id
        expect(getDaemonologyDiscipline('biomancy')).toBeNull();
    });

    it('freezes the registry and its entries', () => {
        expect(Object.isFrozen(DAEMONOLOGY_DISCIPLINES)).toBe(true);
        expect(Object.isFrozen(DAEMONOLOGY_DISCIPLINES[0])).toBe(true);
    });
});

describe('SANCTIC_POWERS registry', () => {
    it('lists the nine canonical Sanctic powers', () => {
        expect(SANCTIC_POWERS.map((p) => p.id)).toEqual([
            'banishment',
            'cleansing-flame',
            'exorcism',
            'hammerhand',
            'holocaust',
            'psychic-communion',
            'purge-soul',
            'sanctuary',
            'word-of-the-emperor',
        ]);
    });

    it('matches the beyond.md XP / PR gates for sampled powers', () => {
        expect(getSancticPower('banishment')).toMatchObject({ xp: 300, prMinimum: 3, isAttack: true });
        expect(getSancticPower('holocaust')).toMatchObject({ xp: 500, prMinimum: 5, isAttack: true });
        expect(getSancticPower('psychic-communion')).toMatchObject({ xp: 100, prMinimum: 0, isAttack: false });
        expect(getSancticPower('exorcism')).toMatchObject({ xp: 200, isAttack: true });
        expect(getSancticPower('hammerhand')).toMatchObject({ isAttack: false });
    });

    it('returns null for an unknown power id', () => {
        // @ts-expect-error -- intentionally passing an out-of-union id
        expect(getSancticPower('not-a-power')).toBeNull();
    });

    it('isSancticDiscipline recognises only the sanctic tree', () => {
        expect(isSancticDiscipline('sanctic')).toBe(true);
        expect(isSancticDiscipline('malefic')).toBe(false);
        expect(isSancticDiscipline('telepathy')).toBe(false);
    });
});

describe('getSancticCorruptionCost (#130 — no per-use corruption)', () => {
    it('returns 0 on a successful manifestation regardless of PR', () => {
        expect(getSancticCorruptionCost(8, true)).toBe(0);
        expect(getSancticCorruptionCost(0, true)).toBe(0);
    });

    it('returns 0 on a failed manifestation', () => {
        expect(getSancticCorruptionCost(5, false)).toBe(0);
    });
});

describe('Malefic comparison still charges corruption (contrast preserved)', () => {
    it('Sanctic costs 0 where the same PR Malefic costs PR', () => {
        for (const pr of [1, 3, 6, 10]) {
            expect(getSancticCorruptionCost(pr, true)).toBe(0);
            expect(getMaleficCorruptionCost('malefic', pr, true)).toBe(pr);
            // The shared Malefic guard already exempts 'sanctic'.
            expect(getMaleficCorruptionCost('sanctic', pr, true)).toBe(0);
        }
    });
});

describe('resolveSancticManifestation (composition with psychic-push + mitigation)', () => {
    it('unfettered: full PR, no focus modifier, no phenomena, no corruption', () => {
        const r = resolveSancticManifestation({
            powerId: 'banishment',
            mode: 'unfettered',
            basePR: 4,
            success: true,
        });
        expect(r.power.id).toBe('banishment');
        expect(r.effectivePR).toBe(4);
        expect(r.focusModifier).toBe(0);
        expect(r.corruption).toBe(0);
        expect(r.phenomenaFires).toBe(false);
        expect(r.phenomenaModifier).toBe(0);
    });

    it('fettered: half PR, +10 focus, still zero corruption', () => {
        const r = resolveSancticManifestation({
            powerId: 'holocaust',
            mode: 'fettered',
            basePR: 5,
            success: true,
        });
        expect(r.effectivePR).toBe(2);
        expect(r.focusModifier).toBe(10);
        expect(r.corruption).toBe(0);
        expect(r.phenomenaFires).toBe(false);
    });

    it('push forces a Phenomena draw on success (still no corruption)', () => {
        const r = resolveSancticManifestation({
            powerId: 'cleansing-flame',
            mode: 'push',
            basePR: 4,
            pushLevel: 2,
            success: true,
        });
        expect(r.effectivePR).toBe(6);
        expect(r.focusModifier).toBe(-20);
        expect(r.phenomenaFires).toBe(true);
        expect(r.phenomenaModifier).toBe(10);
        expect(r.corruption).toBe(0);
    });

    it('push on a FAILED test does not fire Phenomena', () => {
        const r = resolveSancticManifestation({
            powerId: 'cleansing-flame',
            mode: 'push',
            basePR: 4,
            pushLevel: 1,
            success: false,
        });
        expect(r.phenomenaFires).toBe(false);
        expect(r.phenomenaModifier).toBe(0);
        expect(r.canSoulBindIgnore).toBe(false);
        expect(r.canFateNegate).toBe(false);
    });

    it('Soul Binding (Astropath #86) can ignore a fired Phenomena', () => {
        const r = resolveSancticManifestation({
            powerId: 'sanctuary',
            mode: 'push',
            basePR: 6,
            pushLevel: 1,
            success: true,
            mitigation: { soulBinding: true },
        });
        expect(r.phenomenaFires).toBe(true);
        expect(r.canSoulBindIgnore).toBe(true);
        expect(r.canFateNegate).toBe(false);
    });

    it("Emperor's Anathema (Sanctic Purity #131) can Fate-negate a fired Phenomena", () => {
        const r = resolveSancticManifestation({
            powerId: 'sanctuary',
            mode: 'push',
            basePR: 6,
            pushLevel: 1,
            success: true,
            mitigation: { emperorsAnathema: true },
        });
        expect(r.phenomenaFires).toBe(true);
        expect(r.canFateNegate).toBe(true);
        expect(r.canSoulBindIgnore).toBe(false);
    });

    it('mitigation flags are inert when no Phenomena fires (unfettered)', () => {
        const r = resolveSancticManifestation({
            powerId: 'hammerhand',
            mode: 'unfettered',
            basePR: 4,
            success: true,
            mitigation: { soulBinding: true, emperorsAnathema: true },
        });
        expect(r.phenomenaFires).toBe(false);
        expect(r.canSoulBindIgnore).toBe(false);
        expect(r.canFateNegate).toBe(false);
    });

    it('throws on an unknown power id', () => {
        expect(() =>
            resolveSancticManifestation({
                // @ts-expect-error -- intentionally invalid power id
                powerId: 'not-a-power',
                mode: 'unfettered',
                basePR: 3,
                success: true,
            }),
        ).toThrow(/Unknown Sanctic power/);
    });
});
