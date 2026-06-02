import { describe, expect, it } from 'vitest';
import { isCreatureActorType, itemKey, selectGrantsToAdd } from './default-grants.ts';

describe('default-grants', () => {
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
});
