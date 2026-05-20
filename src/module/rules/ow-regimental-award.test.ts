import { describe, it, expect } from 'vitest';
import { mergeRegimentalAwards, awardableForMission, type RegimentalAward } from './ow-regimental-award';

const VALOUR: RegimentalAward = {
    id: 'award-valour',
    name: 'Medallion Crimson',
    description: 'For valour in the face of overwhelming odds.',
    bonus: { characteristic: 'WP', modifier: 3 },
};

const WOUND_BADGE: RegimentalAward = {
    id: 'award-wound',
    name: 'Wound Badge',
    description: 'For wounds suffered and survived.',
    bonus: { characteristic: 'T', modifier: 2, bonusFatePoint: 1 },
};

const HONOURABLE: RegimentalAward = {
    id: 'award-honour',
    name: 'Honourable Mention',
    description: 'A token of regimental recognition.',
    bonus: { trait: 'Compendium.wh40k-rpg.ow-traits.Item.honourable' },
};

const STACKING_VALOUR: RegimentalAward = {
    id: 'award-valour-2',
    name: 'Second Medallion',
    description: 'A second commendation for valour.',
    bonus: { characteristic: 'WP', modifier: 2 },
};

describe('mergeRegimentalAwards', () => {
    it('returns an empty payload when no awards are passed', () => {
        const merged = mergeRegimentalAwards([]);
        expect(merged.characteristicDelta).toEqual({});
        expect(merged.traits).toEqual([]);
        expect(merged.bonusFatePoints).toBe(0);
    });

    it('applies a single award’s characteristic delta', () => {
        const merged = mergeRegimentalAwards([VALOUR]);
        expect(merged.characteristicDelta).toEqual({ WP: 3 });
        expect(merged.bonusFatePoints).toBe(0);
    });

    it('sums characteristic deltas across awards bumping the same characteristic', () => {
        const merged = mergeRegimentalAwards([VALOUR, STACKING_VALOUR]);
        expect(merged.characteristicDelta).toEqual({ WP: 5 });
    });

    it('keeps deltas on different characteristics separate', () => {
        const merged = mergeRegimentalAwards([VALOUR, WOUND_BADGE]);
        expect(merged.characteristicDelta).toEqual({ WP: 3, T: 2 });
    });

    it('accumulates bonus fate points across awards', () => {
        const EXTRA_FATE: RegimentalAward = {
            id: 'award-fate',
            name: 'Inspirational Honour',
            description: 'Grants extra fate.',
            bonus: { bonusFatePoint: 2 },
        };
        const merged = mergeRegimentalAwards([WOUND_BADGE, EXTRA_FATE]);
        expect(merged.bonusFatePoints).toBe(3);
    });

    it('de-duplicates identical trait ids', () => {
        const merged = mergeRegimentalAwards([HONOURABLE, HONOURABLE]);
        expect(merged.traits).toEqual(['Compendium.wh40k-rpg.ow-traits.Item.honourable']);
    });

    it('ignores empty / no-op bonus entries', () => {
        const EMPTY: RegimentalAward = {
            id: 'award-empty',
            name: 'Empty',
            description: 'No bonus.',
            bonus: {},
        };
        const PARTIAL_NO_MOD: RegimentalAward = {
            id: 'award-partial',
            name: 'Partial',
            description: 'Characteristic without modifier.',
            bonus: { characteristic: 'WS' },
        };
        const merged = mergeRegimentalAwards([EMPTY, PARTIAL_NO_MOD, VALOUR]);
        expect(merged.characteristicDelta).toEqual({ WP: 3 });
        expect(merged.traits).toEqual([]);
        expect(merged.bonusFatePoints).toBe(0);
    });
});

describe('awardableForMission', () => {
    it('returns all candidate awards (content-agnostic placeholder)', () => {
        const result = awardableForMission({
            awards: [VALOUR, WOUND_BADGE, HONOURABLE],
            missionRating: 3,
        });
        expect(result).toHaveLength(3);
        expect(result.map((a) => a.id)).toEqual(['award-valour', 'award-wound', 'award-honour']);
    });

    it('returns a fresh array independent of the input list', () => {
        const inputs: RegimentalAward[] = [VALOUR];
        const result = awardableForMission({ awards: inputs, missionRating: 1 });
        result.push(WOUND_BADGE);
        expect(inputs).toHaveLength(1);
    });
});
