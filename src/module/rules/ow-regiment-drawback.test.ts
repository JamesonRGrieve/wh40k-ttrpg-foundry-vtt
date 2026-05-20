/**
 * Tests for OW Regimental Drawbacks + Mixed Regiments + Multiple
 * Comrades (#160).
 */

import { describe, it, expect } from 'vitest';
import {
    applyDrawbacksToBudget,
    mergeDrawbackPenalties,
    applyMixedRegimentOverrides,
    totalComradeCount,
    addComrade,
    removeComrade,
    type RegimentDrawback,
    type MultiComradeRoster,
} from './ow-regiment-drawback';
import { REGIMENT_BUDGET } from './ow-regiment-creation';

const drawbackA: RegimentDrawback = {
    id: 'dw-a',
    description: 'Cursed Founding',
    refund: 3,
    penalty: {
        characteristics: { fellowship: -5 },
        skills: ['skill-doom-haunted'],
        talents: [],
        wounds: -1,
        logistics: -1,
        kitModifier: -2,
    },
};

const drawbackB: RegimentDrawback = {
    id: 'dw-b',
    description: 'Hated Foes',
    refund: 2,
    penalty: {
        characteristics: { fellowship: -2, weaponSkill: 0 },
        skills: ['skill-grudge'],
        talents: ['talent-vendetta'],
        wounds: 0,
        logistics: 0,
        kitModifier: 0,
    },
};

describe('applyDrawbacksToBudget', () => {
    it('returns the unmodified base budget when no drawbacks are applied', () => {
        const result = applyDrawbacksToBudget(REGIMENT_BUDGET, []);
        expect(result.adjustedBudget).toBe(REGIMENT_BUDGET);
        expect(result.appliedRefund).toBe(0);
    });

    it('adds a single drawback refund to the budget', () => {
        const result = applyDrawbacksToBudget(REGIMENT_BUDGET, [drawbackA]);
        expect(result.adjustedBudget).toBe(REGIMENT_BUDGET + 3);
        expect(result.appliedRefund).toBe(3);
    });

    it('stacks multiple drawback refunds additively', () => {
        const result = applyDrawbacksToBudget(REGIMENT_BUDGET, [drawbackA, drawbackB]);
        expect(result.adjustedBudget).toBe(REGIMENT_BUDGET + 5);
        expect(result.appliedRefund).toBe(5);
    });

    it('skips non-finite refunds without throwing', () => {
        const malformed: RegimentDrawback = { id: 'bad', description: '', refund: Number.NaN, penalty: {} };
        const result = applyDrawbacksToBudget(REGIMENT_BUDGET, [drawbackA, malformed]);
        expect(result.adjustedBudget).toBe(REGIMENT_BUDGET + 3);
        expect(result.appliedRefund).toBe(3);
    });

    it('coerces a non-finite base budget to zero', () => {
        const result = applyDrawbacksToBudget(Number.NaN, [drawbackA]);
        expect(result.adjustedBudget).toBe(3);
        expect(result.appliedRefund).toBe(3);
    });
});

describe('mergeDrawbackPenalties', () => {
    it('returns a zero-valued aggregate when no drawbacks are applied', () => {
        const merged = mergeDrawbackPenalties([]);
        expect(merged.characteristics).toEqual({});
        expect(merged.skills).toEqual([]);
        expect(merged.talents).toEqual([]);
        expect(merged.wounds).toBe(0);
        expect(merged.logistics).toBe(0);
        expect(merged.kitModifier).toBe(0);
    });

    it('sums characteristic deltas per key across drawbacks', () => {
        const merged = mergeDrawbackPenalties([drawbackA, drawbackB]);
        expect(merged.characteristics).toEqual({ fellowship: -7, weaponSkill: 0 });
    });

    it('concatenates skills and talents in drawback order', () => {
        const merged = mergeDrawbackPenalties([drawbackA, drawbackB]);
        expect(merged.skills).toEqual(['skill-doom-haunted', 'skill-grudge']);
        expect(merged.talents).toEqual(['talent-vendetta']);
    });

    it('sums wounds, logistics, and kitModifier across drawbacks', () => {
        const merged = mergeDrawbackPenalties([drawbackA, drawbackB]);
        expect(merged.wounds).toBe(-1);
        expect(merged.logistics).toBe(-1);
        expect(merged.kitModifier).toBe(-2);
    });

    it('ignores non-finite numeric penalty fields', () => {
        const malformed: RegimentDrawback = {
            id: 'bad',
            description: '',
            refund: 0,
            penalty: {
                characteristics: { willpower: Number.NaN },
                wounds: Number.NaN,
                logistics: Number.NaN,
                kitModifier: Number.NaN,
            },
        };
        const merged = mergeDrawbackPenalties([drawbackA, malformed]);
        expect(merged.characteristics).toEqual({ fellowship: -5 });
        expect(merged.wounds).toBe(-1);
        expect(merged.logistics).toBe(-1);
        expect(merged.kitModifier).toBe(-2);
    });
});

describe('applyMixedRegimentOverrides', () => {
    it('falls back to the base selection when no override is provided', () => {
        const result = applyMixedRegimentOverrides({ homeWorld: 'home-base', commandingOfficer: 'co-base' }, { memberId: 'm1' });
        expect(result).toEqual({ homeWorld: 'home-base', commandingOfficer: 'co-base' });
    });

    it('applies a Home World override while keeping the base CO', () => {
        const result = applyMixedRegimentOverrides(
            { homeWorld: 'home-base', commandingOfficer: 'co-base' },
            { memberId: 'm1', homeWorldOverrideId: 'home-other' },
        );
        expect(result).toEqual({ homeWorld: 'home-other', commandingOfficer: 'co-base' });
    });

    it('applies a Commanding Officer override while keeping the base Home World', () => {
        const result = applyMixedRegimentOverrides(
            { homeWorld: 'home-base', commandingOfficer: 'co-base' },
            { memberId: 'm1', commandingOfficerOverrideId: 'co-other' },
        );
        expect(result).toEqual({ homeWorld: 'home-base', commandingOfficer: 'co-other' });
    });

    it('applies both overrides simultaneously', () => {
        const result = applyMixedRegimentOverrides(
            { homeWorld: 'home-base', commandingOfficer: 'co-base' },
            {
                memberId: 'm1',
                homeWorldOverrideId: 'home-other',
                commandingOfficerOverrideId: 'co-other',
            },
        );
        expect(result).toEqual({ homeWorld: 'home-other', commandingOfficer: 'co-other' });
    });

    it('treats empty-string overrides as absent (fall back to base)', () => {
        const result = applyMixedRegimentOverrides(
            { homeWorld: 'home-base', commandingOfficer: 'co-base' },
            { memberId: 'm1', homeWorldOverrideId: '', commandingOfficerOverrideId: '' },
        );
        expect(result).toEqual({ homeWorld: 'home-base', commandingOfficer: 'co-base' });
    });

    it('omits slots that have neither a base value nor an override', () => {
        const result = applyMixedRegimentOverrides({}, { memberId: 'm1' });
        expect(result).toEqual({});
    });
});

describe('Multiple Comrades roster', () => {
    const roster: MultiComradeRoster = {
        primaryId: 'comrade-primary',
        additionalIds: ['comrade-a', 'comrade-b'],
    };

    it('totalComradeCount counts primary + additionals', () => {
        expect(totalComradeCount({ primaryId: 'only', additionalIds: [] })).toBe(1);
        expect(totalComradeCount(roster)).toBe(3);
    });

    it('addComrade appends a new id to additionals', () => {
        const next = addComrade(roster, 'comrade-c');
        expect(next.primaryId).toBe('comrade-primary');
        expect(next.additionalIds).toEqual(['comrade-a', 'comrade-b', 'comrade-c']);
    });

    it('addComrade is a no-op when the id duplicates an existing comrade', () => {
        expect(addComrade(roster, 'comrade-a')).toBe(roster);
        expect(addComrade(roster, 'comrade-primary')).toBe(roster);
    });

    it('addComrade is a no-op on empty-string input', () => {
        expect(addComrade(roster, '')).toBe(roster);
    });

    it('removeComrade strips a matching additional and keeps the primary', () => {
        const next = removeComrade(roster, 'comrade-a');
        expect(next.primaryId).toBe('comrade-primary');
        expect(next.additionalIds).toEqual(['comrade-b']);
    });

    it('removeComrade promotes the first additional when primary is removed', () => {
        const next = removeComrade(roster, 'comrade-primary');
        expect(next.primaryId).toBe('comrade-a');
        expect(next.additionalIds).toEqual(['comrade-b']);
    });

    it('removeComrade refuses to drop below the primary slot (no additionals)', () => {
        const solo: MultiComradeRoster = { primaryId: 'only', additionalIds: [] };
        expect(removeComrade(solo, 'only')).toBe(solo);
    });

    it('removeComrade returns the roster unchanged when the id is not present', () => {
        expect(removeComrade(roster, 'comrade-nope')).toBe(roster);
        expect(removeComrade(roster, '')).toBe(roster);
    });
});
