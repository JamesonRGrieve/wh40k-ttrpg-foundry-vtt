import { describe, expect, it } from 'vitest';
import { applyDefaultGrantPolicy, dedupeByKey, isCreatureActorType, itemKey, selectDuplicateGrantIds, selectGrantsToAdd } from './default-grants.ts';

describe('default-grants', () => {
    describe('intra-batch de-duplication (#228)', () => {
        const unarmed = { name: 'Unarmed', type: 'weapon' };

        it('a grant batch never contains two sources with the same (name, type)', () => {
            // The live failure: the scan reached one flagged Unarmed through
            // several packs, and the whole batch was embedded in one call — so
            // the pre-write `existingKeys` snapshot could not catch it.
            const eightCopies = Array.from({ length: 8 }, () => ({ ...unarmed }));
            expect(selectGrantsToAdd(eightCopies, new Set())).toHaveLength(1);
        });

        it('keeps genuinely distinct sources while collapsing duplicates', () => {
            const batch = [unarmed, { name: 'Bite', type: 'weapon' }, { ...unarmed }, { name: 'Unarmed', type: 'trait' }];
            expect(dedupeByKey(batch)).toEqual([unarmed, { name: 'Bite', type: 'weapon' }, { name: 'Unarmed', type: 'trait' }]);
        });

        it('still drops sources the actor already carries', () => {
            expect(selectGrantsToAdd([unarmed, { ...unarmed }], new Set([itemKey('Unarmed', 'weapon')]))).toEqual([]);
        });
    });

    describe('selectDuplicateGrantIds — repair for already-accumulated copies (#228)', () => {
        const granted = (id: string, name = 'Unarmed') => ({ id, name, type: 'weapon', system: { grantedByDefault: true } });

        it('keeps the first copy and returns every surplus id', () => {
            expect(selectDuplicateGrantIds([granted('a'), granted('b'), granted('c')])).toEqual(['b', 'c']);
        });

        it('leaves a single copy alone', () => {
            expect(selectDuplicateGrantIds([granted('a')])).toEqual([]);
        });

        it('never touches duplicate items that were not default-granted', () => {
            // Two identical bought weapons are legitimate inventory.
            const bought = { id: 'x', name: 'Laspistol', type: 'weapon', system: { grantedByDefault: false } };
            expect(selectDuplicateGrantIds([bought, { ...bought, id: 'y' }])).toEqual([]);
        });

        it('de-dupes per (name, type), not across different granted items', () => {
            expect(selectDuplicateGrantIds([granted('a'), granted('b', 'Bite'), granted('c'), granted('d', 'Bite')])).toEqual(['c', 'd']);
        });
    });

    describe('isCreatureActorType', () => {
        it('matches character / npc across every line prefix and the bare form', () => {
            for (const type of [
                'dh1-character',
                'dh2-character',
                'rt-character',
                'dw-character',
                'bc-character',
                'ow-character',
                'im-character',
                'dh2-npc',
                'rt-npc',
                'im-npc',
                'character',
                'npc',
            ]) {
                expect(isCreatureActorType(type)).toBe(true);
            }
        });

        it('excludes vehicles, starships and voidcraft', () => {
            for (const type of ['rt-starship', 'dh2-vehicle', 'rt-voidcraft', 'vehicle', 'starship', 'voidcraft', '']) {
                expect(isCreatureActorType(type)).toBe(false);
            }
        });

        it('does not match a type that merely contains npc/character mid-string', () => {
            expect(isCreatureActorType('npc-vehicle')).toBe(false);
            expect(isCreatureActorType('character-sheet')).toBe(false);
        });
    });

    describe('itemKey', () => {
        it('distinguishes same name across different types', () => {
            expect(itemKey('Unarmed', 'weapon')).not.toBe(itemKey('Unarmed', 'trait'));
        });

        it('is stable for the same (name, type)', () => {
            expect(itemKey('Unarmed', 'weapon')).toBe(itemKey('Unarmed', 'weapon'));
        });
    });

    describe('selectGrantsToAdd', () => {
        const unarmed = { name: 'Unarmed', type: 'weapon' };

        it('adds a source the actor does not already have', () => {
            expect(selectGrantsToAdd([unarmed], new Set())).toEqual([unarmed]);
        });

        it('skips a source already present by name + type (idempotent on duplication / import)', () => {
            const existing = new Set([itemKey('Unarmed', 'weapon')]);
            expect(selectGrantsToAdd([unarmed], existing)).toEqual([]);
        });

        it('treats the same name with a different type as a distinct item to add', () => {
            const existing = new Set([itemKey('Unarmed', 'trait')]);
            expect(selectGrantsToAdd([unarmed], existing)).toEqual([unarmed]);
        });

        it('returns only the missing subset when several sources are given', () => {
            const knife = { name: 'Knife', type: 'weapon' };
            const existing = new Set([itemKey('Unarmed', 'weapon')]);
            expect(selectGrantsToAdd([unarmed, knife], existing)).toEqual([knife]);
        });
    });

    describe('applyDefaultGrantPolicy', () => {
        it('forces system.bound = true on a source that lacks a bound flag', () => {
            const [out] = applyDefaultGrantPolicy([{ name: 'Unarmed', type: 'weapon', system: { damage: '1d10' } }]);
            expect(out).toMatchObject({ system: { bound: true } });
        });

        it('overrides an existing system.bound = false', () => {
            const [out] = applyDefaultGrantPolicy([{ name: 'Unarmed', type: 'weapon', system: { bound: false } }]);
            expect(out).toMatchObject({ system: { bound: true } });
        });

        it('binds a source with no system block at all', () => {
            const [out] = applyDefaultGrantPolicy([{ name: 'Unarmed', type: 'weapon' }]);
            expect(out).toMatchObject({ system: { bound: true } });
        });

        it('preserves the rest of the system payload (per-line variant fields untouched)', () => {
            const [out] = applyDefaultGrantPolicy([{ name: 'Unarmed', type: 'weapon', system: { damage: '1d10', penetration: 0 } }]);
            expect(out).toEqual({ name: 'Unarmed', type: 'weapon', system: { damage: '1d10', penetration: 0, bound: true } });
        });

        it('does not mutate the input sources (cached scan results stay clean)', () => {
            const source = { name: 'Unarmed', type: 'weapon', system: { bound: false } };
            applyDefaultGrantPolicy([source]);
            expect(source.system.bound).toBe(false);
        });

        it('binds every source when several are granted', () => {
            const out = applyDefaultGrantPolicy([
                { name: 'Unarmed', type: 'weapon', system: {} },
                { name: 'Bite', type: 'weapon', system: {} },
            ]);
            expect(out.every((s) => (s['system'] as { bound?: boolean }).bound === true)).toBe(true);
        });
    });
});
