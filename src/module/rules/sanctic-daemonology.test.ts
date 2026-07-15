/**
 * Sanctic Daemonology manifestation-mechanics tests (#130).
 *
 * Covers the discipline's content-agnostic plumbing:
 *   - Sanctic power use does NOT increment corruption.
 *   - The Malefic comparison still charges PR-worth of corruption
 *     (the defining contrast is asserted from both sides).
 *   - Composition with the shared Push/Fettered/Unfettered selector
 *     and the Soul Binding / Sanctic Purity Phenomena interactions
 *     (#86 Astropath, #131 Emperor's Anathema).
 *
 * The Sanctic power content (names, XP costs, Psy-Rating gates, effect
 * prose) is NOT tested here — it lives as `psychicPower` compendium
 * items in `dh2-beyond-items-psychic-powers` (`discipline` =
 * "Sanctic Daemonology"). The resolver treats `powerId` as opaque; the
 * display name is resolved from the compendium at render time (exercised
 * by `tests/e2e/sanctic-daemonology.spec.ts`).
 */

import { describe, expect, it } from 'vitest';
import { getMaleficCorruptionCost } from './malefic-corruption.ts';
import { getSancticCorruptionCost, isSancticDiscipline, resolveSancticManifestation } from './sanctic-daemonology.ts';

describe('isSancticDiscipline', () => {
    it('recognises only the sanctic tree', () => {
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
        expect(r.powerId).toBe('banishment');
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

    it('echoes an opaque powerId (compendium UUID) untouched', () => {
        const uuid = 'Compendium.wh40k-rpg.dh2-beyond-items-psychic-powers.Item.EB2Bnshmnt000001';
        const r = resolveSancticManifestation({
            powerId: uuid,
            mode: 'unfettered',
            basePR: 3,
            success: true,
        });
        expect(r.powerId).toBe(uuid);
    });
});
