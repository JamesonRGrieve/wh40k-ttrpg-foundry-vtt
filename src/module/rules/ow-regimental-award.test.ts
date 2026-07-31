import { describe, it, expect } from 'vitest';
import { mergeRegimentalAwards, awardableForMission, buildBattlefieldPanel, type RegimentalAward } from './ow-regimental-award';

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

describe('buildBattlefieldPanel', () => {
    const CATALOGUE: Record<string, RegimentalAward> = {
        [VALOUR.id]: VALOUR,
        [WOUND_BADGE.id]: WOUND_BADGE,
    };
    const resolve = (id: string): RegimentalAward | undefined => CATALOGUE[id];

    it('gates the Request Support button on the cooldown, in both directions', () => {
        // The live defect this builder fixes: the sheet supplied no `canRequestSupport`
        // at all. The template gates the button on `{{#unless canRequestSupport}}`, and
        // undefined is falsy, so `disabled` was rendered unconditionally — Support could
        // never be requested, cooldown or not. The ready case below is the half that was
        // broken; assert both so the gate cannot regress to a constant in either
        // direction.
        const onCooldown = buildBattlefieldPanel([], 3, resolve);
        expect(onCooldown.canRequestSupport).toBe(false);
        expect(onCooldown.cooldownActive).toBe(true);
        expect(onCooldown.supportCooldown).toBe(3);

        const ready = buildBattlefieldPanel([], 0, resolve);
        expect(ready.canRequestSupport).toBe(true);
        expect(ready.cooldownActive).toBe(false);
    });

    it('normalises a negative or non-finite cooldown to ready', () => {
        for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const panel = buildBattlefieldPanel([], bad, resolve);
            expect(panel.supportCooldown).toBe(0);
            expect(panel.canRequestSupport).toBe(true);
        }
    });

    it('projects conferred ids into rows and merges their bonuses', () => {
        const panel = buildBattlefieldPanel([VALOUR.id, WOUND_BADGE.id], 0, resolve);

        expect(panel.availableAwards.map((r) => r.name)).toEqual(['Medallion Crimson', 'Wound Badge']);
        expect(panel.availableAwards.every((r) => r.conferred)).toBe(true);
        expect(panel.merged.characteristicDelta).toEqual({ WP: 3, T: 2 });
        expect(panel.merged.bonusFatePoints).toBe(1);
        expect(panel.merged.entryCount).toBe(2);
        expect(panel.merged.hasAny).toBe(true);
    });

    it('keeps an unresolved id togglable, labelled by its own id', () => {
        // A row whose content pack is absent must still carry a non-empty
        // `data-award-id`, or `owToggleAward` no-ops and the award can never be
        // removed — strictly worse than a bare label.
        const panel = buildBattlefieldPanel(['award-missing'], 0, resolve);

        expect(panel.availableAwards).toHaveLength(1);
        expect(panel.availableAwards[0]?.id).toBe('award-missing');
        expect(panel.availableAwards[0]?.name).toBe('award-missing');
        // Unresolved ids contribute no bonus, so they do not inflate the readout.
        expect(panel.merged.entryCount).toBe(0);
        expect(panel.merged.hasAny).toBe(false);
    });

    it('skips empty ids without emitting a dead row', () => {
        const panel = buildBattlefieldPanel(['', VALOUR.id, ''], 0, resolve);
        expect(panel.availableAwards).toHaveLength(1);
        expect(panel.availableAwards[0]?.id).toBe(VALOUR.id);
    });

    it('reports hasAny false when nothing is conferred', () => {
        const panel = buildBattlefieldPanel([], 0, resolve);
        expect(panel.availableAwards).toEqual([]);
        expect(panel.merged.hasAny).toBe(false);
        expect(panel.merged.entryCount).toBe(0);
    });
});
