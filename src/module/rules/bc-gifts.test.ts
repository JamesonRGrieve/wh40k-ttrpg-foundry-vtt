/**
 * Tests for the Black Crusade Gifts of the Gods resolver (#180).
 *
 * Covers the adapter from an owned mutation item, base-vs-rider merging,
 * alignment matching, grant / Active Effect dedup, the per-actor aggregation
 * via `mergeGiftDeltas`, and the acquisition-roll bookkeeping.
 *
 * Per Direction #7 the fixtures are structural — no real gift names or
 * values from the Gifts of the Gods table; the catalogue lives in the compendium.
 */
import { describe, expect, it } from 'vitest';
import {
    giftDefFromMutation,
    mergeGiftDeltas,
    pendingGiftRolls,
    resolveGiftForAlignment,
    signedGiftRoll,
    type GiftData,
    type GiftDef,
    type GiftRider,
} from './bc-gifts.ts';

function rider(overrides: Partial<GiftRider> & Pick<GiftRider, 'alignment'>): GiftRider {
    return { description: '', characteristics: {}, skills: {}, grants: [], activeEffect: '', ...overrides };
}

function makeGift(overrides: Partial<GiftDef> = {}): GiftDef {
    return {
        id: 'gift-test-001',
        name: 'Test Gift',
        baseDescription: 'A structural test gift.',
        baseCharacteristics: {},
        baseSkills: {},
        baseGrants: [],
        riders: [],
        subTable: '',
        ...overrides,
    };
}

function giftData(overrides: Partial<GiftData> = {}): GiftData {
    return { grants: [], riders: [], subTable: '', characteristicRolls: [], ...overrides };
}

describe('giftDefFromMutation', () => {
    it('reads the base effect from effect + modifiers and the rest from system.gift', () => {
        const riders = [rider({ alignment: 'nurgle', description: 'n' })];
        const def = giftDefFromMutation({
            id: 'item-1',
            name: 'Owned Gift',
            system: {
                effect: '<p>base</p>',
                modifiers: { characteristics: { toughness: 4 }, skills: { awareness: 10 } },
                gift: giftData({ grants: ['uuid.base'], riders, subTable: 'animal' }),
            },
        });

        expect(def).toEqual({
            id: 'item-1',
            name: 'Owned Gift',
            baseDescription: '<p>base</p>',
            baseCharacteristics: { toughness: 4 },
            baseSkills: { awareness: 10 },
            baseGrants: ['uuid.base'],
            riders,
            subTable: 'animal',
        });
    });

    it('maps a null item id (an unsaved document) to an empty id', () => {
        const def = giftDefFromMutation({ id: null, name: 'x', system: { effect: '', modifiers: { characteristics: {}, skills: {} }, gift: giftData() } });
        expect(def.id).toBe('');
    });
});

describe('resolveGiftForAlignment', () => {
    it('returns base-only resolution when unaligned', () => {
        const gift = makeGift({
            baseCharacteristics: { strength: 5 },
            baseGrants: ['uuid.base'],
            riders: [
                rider({ alignment: 'khorne', description: 'k', characteristics: { strength: 5 }, grants: ['uuid.khorne'] }),
                rider({ alignment: 'slaanesh', description: 's', characteristics: { agility: 5 } }),
            ],
        });

        const resolved = resolveGiftForAlignment(gift, 'unaligned');

        expect(resolved.id).toBe(gift.id);
        expect(resolved.name).toBe(gift.name);
        expect(resolved.baseDescription).toBe(gift.baseDescription);
        expect(resolved.riderDescription).toBe('');
        expect(resolved.characteristicDelta).toEqual({ strength: 5 });
        expect(resolved.grants).toEqual(['uuid.base']);
        expect(resolved.activeEffects).toEqual([]);
        expect(resolved.appliedAlignment).toBe('unaligned');
    });

    it('returns base-only resolution when the alignment has no matching rider', () => {
        const gift = makeGift({
            baseCharacteristics: { toughness: 3 },
            riders: [rider({ alignment: 'tzeentch', description: 't', characteristics: { intelligence: 5 } })],
        });

        const resolved = resolveGiftForAlignment(gift, 'nurgle');

        expect(resolved.characteristicDelta).toEqual({ toughness: 3 });
        expect(resolved.appliedAlignment).toBe('unaligned');
    });

    it('merges base + the matching rider, including its text, skills, grants and Active Effect', () => {
        const gift = makeGift({
            baseCharacteristics: { strength: 5 },
            baseSkills: { awareness: 10 },
            baseGrants: ['uuid.base'],
            riders: [
                rider({
                    alignment: 'khorne',
                    description: 'khorne text',
                    characteristics: { weaponSkill: 5 },
                    skills: { intimidate: 10 },
                    grants: ['uuid.khorne'],
                    activeEffect: 'ae.khorne',
                }),
                rider({ alignment: 'slaanesh', description: 's', characteristics: { agility: 5 } }),
            ],
        });

        const resolved = resolveGiftForAlignment(gift, 'khorne');

        expect(resolved.appliedAlignment).toBe('khorne');
        expect(resolved.riderDescription).toBe('khorne text');
        expect(resolved.characteristicDelta).toEqual({ strength: 5, weaponSkill: 5 });
        expect(resolved.skillDelta).toEqual({ awareness: 10, intimidate: 10 });
        expect(resolved.grants).toEqual(['uuid.base', 'uuid.khorne']);
        expect(resolved.activeEffects).toEqual(['ae.khorne']);
    });

    it('sums rider deltas with base deltas on shared keys', () => {
        const gift = makeGift({
            baseCharacteristics: { strength: 5, toughness: 3 },
            riders: [rider({ alignment: 'nurgle', characteristics: { strength: 5, willpower: 5 } })],
        });

        expect(resolveGiftForAlignment(gift, 'nurgle').characteristicDelta).toEqual({ strength: 10, toughness: 3, willpower: 5 });
    });

    it('emits a grant shared by base and rider once', () => {
        const gift = makeGift({ baseGrants: ['uuid.shared'], riders: [rider({ alignment: 'tzeentch', grants: ['uuid.shared'] })] });

        expect(resolveGiftForAlignment(gift, 'tzeentch').grants).toEqual(['uuid.shared']);
    });
});

describe('mergeGiftDeltas', () => {
    it('returns an empty object for an empty input array', () => {
        expect(mergeGiftDeltas([])).toEqual({});
    });

    it('sums deltas across multiple gifts on shared and distinct keys', () => {
        expect(mergeGiftDeltas([{ s: 5, t: 3 }, { s: 5, ws: 5 }, { t: 2 }])).toEqual({ s: 10, t: 5, ws: 5 });
    });

    it('preserves negative deltas', () => {
        expect(mergeGiftDeltas([{ ag: -5, fel: 3 }, { ag: -2 }])).toEqual({ ag: -7, fel: 3 });
    });

    it('ignores non-finite values without crashing', () => {
        expect(
            mergeGiftDeltas([
                { s: 5, t: Number.NaN },
                { s: Number.POSITIVE_INFINITY, ws: 3 },
            ]),
        ).toEqual({ s: 5, ws: 3 });
    });
});

describe('pendingGiftRolls', () => {
    const rolls = giftData({
        characteristicRolls: [
            { characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' },
            { characteristic: 'strength', formula: '1d5+1', direction: 'gain' },
        ],
    });

    it('lists every roll while nothing has been rolled', () => {
        expect(pendingGiftRolls(rolls, {}).map((r) => r.characteristic)).toEqual(['intelligence', 'strength']);
    });

    it('drops a roll once its characteristic holds a stored result, even a zero', () => {
        expect(pendingGiftRolls(rolls, { intelligence: 0 }).map((r) => r.characteristic)).toEqual(['strength']);
    });

    it('is empty for a gift with no acquisition rolls', () => {
        expect(pendingGiftRolls(giftData(), {})).toEqual([]);
    });
});

describe('signedGiftRoll', () => {
    it('negates a loss and keeps a gain', () => {
        expect(signedGiftRoll({ characteristic: 'agility', formula: '1d10+10', direction: 'loss' }, 14)).toBe(-14);
        expect(signedGiftRoll({ characteristic: 'agility', formula: '1d5+2', direction: 'gain' }, 4)).toBe(4);
    });
});
