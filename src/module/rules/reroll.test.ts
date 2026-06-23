import { describe, expect, it } from 'vitest';
import { type RerollSpec, rerollApplies, rerollLedgerKey, rerollUseAvailable } from './reroll.ts';

function spec(overrides: Partial<RerollSpec> = {}): RerollSpec {
    return {
        enabled: true,
        modifier: 0,
        condition: 'failed',
        appliesTo: { mode: 'any', types: [], keys: [] },
        frequency: 'at-will',
        uses: 1,
        label: '',
        ...overrides,
    };
}

describe('rerollApplies', () => {
    it('returns false when the re-roll is disabled', () => {
        expect(rerollApplies(spec({ enabled: false }), { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(false);
    });

    it('condition "failed" applies only to failed rolls', () => {
        const s = spec({ condition: 'failed' });
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(true);
        expect(rerollApplies(s, { success: true, type: 'Skill', rollKey: 'awareness' })).toBe(false);
    });

    it('condition "success" applies only to successful rolls', () => {
        const s = spec({ condition: 'success' });
        expect(rerollApplies(s, { success: true, type: 'Skill', rollKey: 'awareness' })).toBe(true);
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(false);
    });

    it('condition "any" ignores success state', () => {
        const s = spec({ condition: 'any' });
        expect(rerollApplies(s, { success: true, type: 'Skill', rollKey: 'awareness' })).toBe(true);
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(true);
    });

    it('appliesTo "keys" matches rollKey only', () => {
        const s = spec({ condition: 'any', appliesTo: { mode: 'keys', types: [], keys: ['awareness'] } });
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(true);
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'dodge' })).toBe(false);
    });

    it('appliesTo "types" matches rollData.type only', () => {
        const s = spec({ condition: 'any', appliesTo: { mode: 'types', types: ['Characteristic'], keys: [] } });
        expect(rerollApplies(s, { success: false, type: 'Characteristic', rollKey: 'willpower' })).toBe(true);
        expect(rerollApplies(s, { success: false, type: 'Skill', rollKey: 'willpower' })).toBe(false);
    });

    it('appliesTo "any" matches every test', () => {
        const s = spec({ condition: 'any', appliesTo: { mode: 'any', types: [], keys: [] } });
        expect(rerollApplies(s, { success: false, type: 'Attack', rollKey: 'ballisticSkill' })).toBe(true);
    });

    it('models Keen Intuition: re-roll a failed Awareness test', () => {
        const keen = spec({ condition: 'failed', appliesTo: { mode: 'keys', types: [], keys: ['awareness'] }, frequency: 'at-will' });
        expect(rerollApplies(keen, { success: false, type: 'Skill', rollKey: 'awareness' })).toBe(true);
        expect(rerollApplies(keen, { success: true, type: 'Skill', rollKey: 'awareness' })).toBe(false);
        expect(rerollApplies(keen, { success: false, type: 'Skill', rollKey: 'dodge' })).toBe(false);
    });
});

describe('rerollLedgerKey', () => {
    it('scopes the key to item id + frequency window', () => {
        expect(rerollLedgerKey('abc123', 'per-encounter')).toBe('abc123:per-encounter');
        expect(rerollLedgerKey('abc123', 'per-session')).toBe('abc123:per-session');
    });
});

describe('rerollUseAvailable', () => {
    it('at-will is never exhausted', () => {
        expect(rerollUseAvailable(spec({ frequency: 'at-will', uses: 1 }), 99)).toBe(true);
    });

    it('windowed re-rolls exhaust after the declared uses are consumed', () => {
        const s = spec({ frequency: 'per-encounter', uses: 2 });
        expect(rerollUseAvailable(s, 0)).toBe(true);
        expect(rerollUseAvailable(s, 1)).toBe(true);
        expect(rerollUseAvailable(s, 2)).toBe(false);
        expect(rerollUseAvailable(s, 3)).toBe(false);
    });

    it('treats a uses count below 1 as a single use', () => {
        const s = spec({ frequency: 'per-session', uses: 0 });
        expect(rerollUseAvailable(s, 0)).toBe(true);
        expect(rerollUseAvailable(s, 1)).toBe(false);
    });
});
