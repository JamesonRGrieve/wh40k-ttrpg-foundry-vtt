/**
 * Tests for Black Crusade Chaos Ritual engine (#179).
 *
 * Covers Table 6-7 modifier composition, target clamping, the Contempt
 * of the Warp roll resolver (success / failure, DoS / DoF margins),
 * and the Breaking Mastery opposed contest.
 */
import { describe, expect, it } from 'vitest';

import { computeRitualTarget, resolveBreakingMastery, resolveContemptOfTheWarp, type RitualModifier, type RitualTemplate } from './bc-chaos-ritual';

const TEMPLATE: RitualTemplate = {
    id: 'rite-of-the-iron-gauntlet',
    description: 'A binding rite invoking the Blood God.',
    requirements: 'A sanctified skull, the True Name of a Bloodletter.',
    effects: 'Binds a Bloodletter to the ritualist for one day.',
    duration: '1 hour per Degree of Success.',
    cost: '1d10 Corruption Points.',
    priceOfFailure: '1d10 Wounds and the daemon is freed, hostile.',
    baseTarget: 30,
};

describe('bc-chaos-ritual :: computeRitualTarget', () => {
    it('returns the bare baseTarget when no modifiers stack', () => {
        const { target, breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: [] });
        expect(target).toBe(30);
        expect(breakdown).toEqual([]);
    });

    it('sums positive modifiers above the base target', () => {
        const mods: RitualModifier[] = [
            { kind: 'cult-affiliation', value: 10 },
            { kind: 'sacrifice', value: 15 },
        ];
        const { target, breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(target).toBe(55);
        expect(breakdown).toHaveLength(2);
    });

    it('applies negative modifiers as penalties', () => {
        const mods: RitualModifier[] = [{ kind: 'gm-other', value: -20, description: 'Astral discord' }];
        const { target } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(target).toBe(10);
    });

    it('clamps the final target to a floor of zero', () => {
        const mods: RitualModifier[] = [{ kind: 'gm-other', value: -999 }];
        const { target } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(target).toBe(0);
    });

    it('preserves modifier order in the returned breakdown', () => {
        const mods: RitualModifier[] = [
            { kind: 'sacrifice', value: 5 },
            { kind: 'sanctified-ground', value: 10 },
            { kind: 'component-reagent', value: 5 },
            { kind: 'daemonic-mastery', value: 10 },
        ];
        const { breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(breakdown.map((m) => m.kind)).toEqual(['sacrifice', 'sanctified-ground', 'component-reagent', 'daemonic-mastery']);
    });

    it('returns a fresh breakdown array (not aliasing the input)', () => {
        const mods: RitualModifier[] = [{ kind: 'cult-affiliation', value: 10 }];
        const { breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(breakdown).not.toBe(mods);
        // mutating breakdown shape via cast would be a test smell; instead verify identity
        expect(breakdown[0]).not.toBe(mods[0]);
    });

    it('coerces non-integer modifier values via truncation', () => {
        const mods: RitualModifier[] = [
            { kind: 'cult-affiliation', value: 10.9 },
            { kind: 'sacrifice', value: -5.7 },
        ];
        const { target, breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(breakdown[0]?.value).toBe(10);
        expect(breakdown[1]?.value).toBe(-5);
        expect(target).toBe(35);
    });

    it('preserves an optional description on a modifier', () => {
        const mods: RitualModifier[] = [{ kind: 'sacrifice', value: 20, description: 'Eight skulls offered' }];
        const { breakdown } = computeRitualTarget({ template: TEMPLATE, modifiers: mods });
        expect(breakdown[0]?.description).toBe('Eight skulls offered');
    });

    it('truncates a non-integer baseTarget on the template', () => {
        const fractional: RitualTemplate = { ...TEMPLATE, baseTarget: 42.8 };
        const { target } = computeRitualTarget({ template: fractional, modifiers: [] });
        expect(target).toBe(42);
    });
});

describe('bc-chaos-ritual :: resolveContemptOfTheWarp', () => {
    it('succeeds when the roll equals the target (roll-under-or-equal)', () => {
        const result = resolveContemptOfTheWarp({ target: 50, roll: 50 });
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(0);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('reports one Degree of Success per 10-point margin under the target', () => {
        const result = resolveContemptOfTheWarp({ target: 50, roll: 18 });
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(3);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('reports one Degree of Failure per 10-point margin over the target', () => {
        const result = resolveContemptOfTheWarp({ target: 30, roll: 71 });
        expect(result.success).toBe(false);
        expect(result.degreesOfFailure).toBe(4);
        expect(result.degreesOfSuccess).toBe(0);
    });

    it('reports a marginal failure (0 DoF) on a roll one over the target', () => {
        const result = resolveContemptOfTheWarp({ target: 40, roll: 41 });
        expect(result.success).toBe(false);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('handles a zero target — only roll 0 succeeds', () => {
        expect(resolveContemptOfTheWarp({ target: 0, roll: 0 }).success).toBe(true);
        expect(resolveContemptOfTheWarp({ target: 0, roll: 1 }).success).toBe(false);
    });
});

describe('bc-chaos-ritual :: resolveBreakingMastery', () => {
    it('breaks the binding when the roller exceeds the opponent', () => {
        const result = resolveBreakingMastery({ rollerMasteryRating: 6, opponentMasteryRating: 4 });
        expect(result.broken).toBe(true);
        expect(result.differential).toBe(2);
    });

    it('fails to break the binding on a tie (defender wins)', () => {
        const result = resolveBreakingMastery({ rollerMasteryRating: 5, opponentMasteryRating: 5 });
        expect(result.broken).toBe(false);
        expect(result.differential).toBe(0);
    });

    it('fails to break the binding when the opponent is stronger', () => {
        const result = resolveBreakingMastery({ rollerMasteryRating: 3, opponentMasteryRating: 7 });
        expect(result.broken).toBe(false);
        expect(result.differential).toBe(-4);
    });

    it('truncates non-integer Mastery ratings before comparing', () => {
        const result = resolveBreakingMastery({ rollerMasteryRating: 5.9, opponentMasteryRating: 5.1 });
        expect(result.differential).toBe(0);
        expect(result.broken).toBe(false);
    });
});
