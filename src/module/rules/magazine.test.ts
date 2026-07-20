import { describe, expect, it } from 'vitest';
import { consumeRounds, frontSegment, type MagazineSegment, magazineFromLegacy, magazineTotal, refundRounds } from './magazine.ts';

function seg(over: Partial<MagazineSegment> = {}): MagazineSegment {
    return {
        ammoUuid: 'Compendium.x.Item.a',
        ammoName: 'Standard',
        count: 5,
        modifiers: { damage: 0, penetration: 0, range: 0 },
        clipModifier: 0,
        addedQualities: [],
        removedQualities: [],
        ...over,
    };
}

describe('magazine helpers', () => {
    describe('magazineTotal', () => {
        it('sums segment counts; empty / null → 0', () => {
            expect(magazineTotal([seg({ count: 3 }), seg({ count: 2 })])).toBe(5);
            expect(magazineTotal([])).toBe(0);
            expect(magazineTotal(null)).toBe(0);
            expect(magazineTotal(undefined)).toBe(0);
        });
    });

    describe('frontSegment', () => {
        it('returns the first non-empty segment (the chambered round)', () => {
            const ap = seg({ ammoName: 'AP', count: 2 });
            const hs = seg({ ammoName: 'Hot-shot', count: 3 });
            expect(frontSegment([ap, hs])?.ammoName).toBe('AP');
        });
        it('skips leading empty segments; null when all empty', () => {
            expect(frontSegment([seg({ ammoName: 'AP', count: 0 }), seg({ ammoName: 'HS', count: 1 })])?.ammoName).toBe('HS');
            expect(frontSegment([seg({ count: 0 })])).toBeNull();
            expect(frontSegment([])).toBeNull();
        });
    });

    describe('consumeRounds', () => {
        it('consumes from the front, dropping an emptied segment', () => {
            const mag = [seg({ ammoName: 'AP', count: 2 }), seg({ ammoName: 'HS', count: 3 })];
            const { magazine, consumed } = consumeRounds(mag, 2);
            expect(consumed).toBe(2);
            expect(magazine.map((s) => [s.ammoName, s.count])).toEqual([['HS', 3]]); // AP segment gone
            // input untouched
            expect(mag[0]?.count).toBe(2);
        });

        it('spans segment boundaries when the burst is larger than the front segment', () => {
            const mag = [seg({ ammoName: 'AP', count: 2 }), seg({ ammoName: 'HS', count: 3 })];
            const { magazine, consumed } = consumeRounds(mag, 4); // 2 AP + 2 HS
            expect(consumed).toBe(4);
            expect(magazine.map((s) => [s.ammoName, s.count])).toEqual([['HS', 1]]);
        });

        it('caps at what is available and reports the real consumed count', () => {
            const { magazine, consumed } = consumeRounds([seg({ count: 3 })], 10);
            expect(consumed).toBe(3);
            expect(magazine).toEqual([]);
        });

        it('is a no-op for rounds <= 0', () => {
            const mag = [seg({ count: 3 })];
            expect(consumeRounds(mag, 0)).toEqual({ magazine: [seg({ count: 3 })], consumed: 0 });
        });
    });

    describe('refundRounds', () => {
        it('grows the front segment when it is the same ammo (by uuid)', () => {
            const mag = [seg({ ammoUuid: 'u1', ammoName: 'AP', count: 1 })];
            const out = refundRounds(mag, 2, seg({ ammoUuid: 'u1', ammoName: 'AP' }));
            expect(out[0]?.count).toBe(3);
            expect(out).toHaveLength(1);
        });
        it('prepends a fresh front segment when the refunded ammo differs', () => {
            const mag = [seg({ ammoUuid: 'u1', ammoName: 'AP', count: 1 })];
            const out = refundRounds(mag, 2, seg({ ammoUuid: 'u2', ammoName: 'HS' }));
            expect(out.map((s) => [s.ammoName, s.count])).toEqual([
                ['HS', 2],
                ['AP', 1],
            ]);
        });
        it('is a no-op for rounds <= 0', () => {
            expect(refundRounds([seg({ count: 1 })], 0, seg())).toEqual([seg({ count: 1 })]);
        });
    });

    describe('magazineFromLegacy', () => {
        it('builds a one-segment magazine from loadedAmmo + clip.value', () => {
            const out = magazineFromLegacy(
                {
                    uuid: 'u1',
                    name: 'Man-Stopper',
                    modifiers: { damage: 0, penetration: 3, range: 0 },
                    clipModifier: 0,
                    addedQualities: [],
                    removedQualities: ['reliable'],
                },
                6,
            );
            expect(out).toEqual([
                {
                    ammoUuid: 'u1',
                    ammoName: 'Man-Stopper',
                    count: 6,
                    modifiers: { damage: 0, penetration: 3, range: 0 },
                    clipModifier: 0,
                    addedQualities: [],
                    removedQualities: ['reliable'],
                },
            ]);
        });
        it('returns [] for no loaded ammo or empty clip', () => {
            expect(magazineFromLegacy(null, 6)).toEqual([]);
            expect(
                magazineFromLegacy(
                    { uuid: '', name: '', modifiers: { damage: 0, penetration: 0, range: 0 }, clipModifier: 0, addedQualities: [], removedQualities: [] },
                    6,
                ),
            ).toEqual([]);
            expect(
                magazineFromLegacy(
                    { uuid: 'u1', name: 'X', modifiers: { damage: 0, penetration: 0, range: 0 }, clipModifier: 0, addedQualities: [], removedQualities: [] },
                    0,
                ),
            ).toEqual([]);
        });
    });
});
