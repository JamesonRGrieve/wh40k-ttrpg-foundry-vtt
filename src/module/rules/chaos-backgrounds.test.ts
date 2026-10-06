import { describe, expect, it } from 'vitest';
import { MUTANT_STARTING_CORRUPTION } from './chaos-backgrounds';

/**
 * Contract test for the Within-supplement Mutant background constant (#91,
 * DH2 Enemies Within p.32), consumed by the Mutant background dialog.
 */
describe('Mutant background (#91, within.md p.32)', () => {
    it('starts a Mutant character with +10 Corruption Points vs the 0 baseline', () => {
        expect(MUTANT_STARTING_CORRUPTION).toBe(10);
    });
});
