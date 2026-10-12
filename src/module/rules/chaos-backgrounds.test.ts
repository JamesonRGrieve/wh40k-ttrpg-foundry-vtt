import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { malignancyOutcomes, MUTANT_STARTING_CORRUPTION, mutantCorruptionUpdate } from './chaos-backgrounds';

const DIALOG_SRC = readFileSync(resolve(__dirname, '../applications/prompts/mutant-background-dialog.ts'), 'utf8');

/**
 * Contract test for the Within-supplement Mutant background constant (#91,
 * DH2 Enemies Within p.32), consumed by the Mutant background dialog.
 */
describe('Mutant background (#91, within.md p.32)', () => {
    it('starts a Mutant character with +10 Corruption Points vs the 0 baseline', () => {
        expect(MUTANT_STARTING_CORRUPTION).toBe(10);
    });

    it('writes the plain-number system.corruption path, never the legacy .value object path', () => {
        expect(mutantCorruptionUpdate(0)).toEqual({ 'system.corruption': 10 });
        expect(mutantCorruptionUpdate(7)).toEqual({ 'system.corruption': 17 });
        expect(Object.keys(mutantCorruptionUpdate(0))).not.toContain('system.corruption.value');
    });

    it('Twisted Flesh opens a Mutation as an alternative to a gained Malignancy; without it, only the Malignancy', () => {
        expect(malignancyOutcomes(true)).toEqual(['malignancy', 'mutation']);
        expect(malignancyOutcomes(false)).toEqual(['malignancy']);
    });

    it('the dialog applies Corruption through that update, not a hand-written path', () => {
        expect(DIALOG_SRC).toContain('actor.update(mutantCorruptionUpdate(');
        expect(DIALOG_SRC).not.toContain('corruption.value');
    });
});
