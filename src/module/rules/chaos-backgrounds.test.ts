import { describe, expect, it } from 'vitest';
import { malignancyOutcomes, startingCorruptionHoldsMalignancy, startingMutationFormula, startingMutationRow } from './chaos-backgrounds';
import { malignancyTestsQueued } from './malignancy-test';

/**
 * The Mutant background (#91): starting Corruption, and a starting mutation
 * rolled on the Mutations table in place of the normal roll.
 */
describe('Mutant background (#91)', () => {
    const mutant = { grants: { startingMutationFormula: '5d10' } };
    const homeWorld = { grants: { startingMutationFormula: '' } };

    it('reads the starting-mutation roll from the origin, not from a constant', () => {
        expect(startingMutationFormula(mutant)).toBe('5d10');
        expect(startingMutationFormula({ grants: { startingMutationFormula: '  ' } })).toBeNull();
        expect(startingMutationFormula(homeWorld)).toBeNull();
        expect(startingMutationFormula({})).toBeNull();
    });

    it('pins the owed Malignancy Tests when a starting-mutation origin writes its Corruption', () => {
        expect(startingCorruptionHoldsMalignancy(mutant, { 'system.corruption': 10 }, { malignancyTestsPending: 0 })).toEqual({
            'system.malignancyTestsPending': 0,
        });
        // An owed test from before is kept, not cancelled.
        expect(startingCorruptionHoldsMalignancy(mutant, { 'system.corruption': 17 }, { malignancyTestsPending: 1 })).toEqual({
            'system.malignancyTestsPending': 1,
        });
    });

    it('leaves the normal per-10-points rule alone for any other origin or write', () => {
        // Every 10 Corruption gained calls for a Willpower test against malignancy.
        expect(startingCorruptionHoldsMalignancy(homeWorld, { 'system.corruption': 10 }, { malignancyTestsPending: 0 })).toEqual({});
        expect(startingCorruptionHoldsMalignancy(mutant, { 'system.wounds.max': 12 }, { malignancyTestsPending: 0 })).toEqual({});
        // An NPC has no Malignancy queue to pin.
        expect(startingCorruptionHoldsMalignancy(mutant, { 'system.corruption': 10 }, {})).toEqual({});
        // Without the hold, 0 → 10 Corruption would owe one test.
        expect(malignancyTestsQueued(0, 0, 10)).toBe(1);
    });

    it('reads the starting-mutation total against the Mutations table bands', () => {
        const rows = [
            { range: [1, 6] as const, name: 'Bestial Hide' },
            { range: [7, 11] as const, name: 'Unnatural Arms' },
            { range: [12, 17] as const, name: 'Sightless Orbs' },
        ];
        expect(startingMutationRow(rows, 5)?.name).toBe('Bestial Hide');
        expect(startingMutationRow(rows, 11)?.name).toBe('Unnatural Arms');
        expect(startingMutationRow(rows, 40)).toBeNull();
    });

    it('Twisted Flesh opens a Mutation as an alternative to a gained Malignancy; without it, only the Malignancy', () => {
        expect(malignancyOutcomes(true)).toEqual(['malignancy', 'mutation']);
        expect(malignancyOutcomes(false)).toEqual(['malignancy']);
    });
});
