import { describe, expect, it } from 'vitest';
import { renameKeys } from './migrate-rename.ts';
import type { RawSource } from './raw-source.ts';

describe('renameKeys (#366)', () => {
    describe("'if-target-unset' guard (default — ship-weapon idiom)", () => {
        it('renames legacy key to target and deletes the legacy key', () => {
            const source: RawSource = { powerUsage: 3 };
            renameKeys(source, { powerUsage: 'power' });
            expect(source).toEqual({ power: 3 });
        });

        it('preserves an already-set target and still drops the legacy key', () => {
            const source: RawSource = { powerUsage: 3, power: 7 };
            renameKeys(source, { powerUsage: 'power' });
            // Target wins; legacy key is left in place because the copy was skipped.
            expect(source).toEqual({ powerUsage: 3, power: 7 });
        });

        it('treats a target of undefined as unset and overwrites it', () => {
            const source: RawSource = { spCost: 2, shipPoints: undefined };
            renameKeys(source, { spCost: 'shipPoints' });
            expect(source).toEqual({ shipPoints: 2 });
        });

        it('is a no-op when the legacy key is absent', () => {
            const source: RawSource = { space: 5 };
            renameKeys(source, { spaceUsage: 'space' });
            expect(source).toEqual({ space: 5 });
        });

        it('applies every entry of a multi-key table', () => {
            const source: RawSource = { powerUsage: 1, spaceUsage: 2, spCost: 3, critRating: 4 };
            renameKeys(source, { powerUsage: 'power', spaceUsage: 'space', spCost: 'shipPoints', critRating: 'crit' });
            expect(source).toEqual({ power: 1, space: 2, shipPoints: 3, crit: 4 });
        });
    });

    describe("'overwrite' guard (weapon idiom)", () => {
        it('renames legacy key to target and deletes the legacy key', () => {
            const source: RawSource = { proficiency: 'flame' };
            renameKeys(source, { proficiency: 'requiredTraining' }, { guard: 'overwrite' });
            expect(source).toEqual({ requiredTraining: 'flame' });
        });

        it('overwrites an existing target value', () => {
            const source: RawSource = { proficiency: 'flame', requiredTraining: 'bolt' };
            renameKeys(source, { proficiency: 'requiredTraining' }, { guard: 'overwrite' });
            expect(source).toEqual({ requiredTraining: 'flame' });
        });

        it('is a no-op when the legacy value is undefined', () => {
            const source: RawSource = { proficiency: undefined, requiredTraining: 'bolt' };
            renameKeys(source, { proficiency: 'requiredTraining' }, { guard: 'overwrite' });
            expect(source).toEqual({ proficiency: undefined, requiredTraining: 'bolt' });
        });
    });
});
