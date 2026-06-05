import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KSkill } from '../types/global.d.ts';
import { checkPrerequisites, parsePrerequisiteString, type PrereqActorView } from './prerequisite-validator.ts';

/**
 * Coverage for the prerequisite validator. parsePrerequisiteString is pure;
 * checkPrerequisites is driven through a structural PrereqActorView (the param
 * was narrowed for this) with CONFIG/i18n stubbed — covering the characteristic,
 * skill, and talent paths.
 */

function skill(overrides: Partial<WH40KSkill> = {}): WH40KSkill {
    return { characteristic: 'agility', advanced: false, trained: false, plus10: false, plus20: false, bonus: 0, notes: '', cost: 0, current: 0, ...overrides };
}
describe('parsePrerequisiteString', () => {
    it('parses a characteristic prerequisite ("<KEY> <N>")', () => {
        expect(parsePrerequisiteString('Fel 30')).toEqual({ type: 'characteristic', key: 'Fel', value: 30 });
        expect(parsePrerequisiteString('WS 40')).toEqual({ type: 'characteristic', key: 'WS', value: 40 });
    });

    it('trims surrounding whitespace before matching', () => {
        expect(parsePrerequisiteString('  Fel 30  ')).toEqual({ type: 'characteristic', key: 'Fel', value: 30 });
    });

    it('falls back to a skill/talent name when not a characteristic pattern', () => {
        expect(parsePrerequisiteString('Quick Draw')).toEqual({ type: 'skill', key: 'Quick Draw' });
        expect(parsePrerequisiteString('Dodge')).toEqual({ type: 'skill', key: 'Dodge' });
    });

    it('returns null for an empty/whitespace string', () => {
        expect(parsePrerequisiteString('')).toBeNull();
        expect(parsePrerequisiteString('   ')).toBeNull();
    });
});

describe('checkPrerequisites', () => {
    function actorView(
        opts: { characteristics?: Record<string, { total: number }>; skills?: Record<string, WH40KSkill>; talents?: string[] } = {},
    ): PrereqActorView {
        const talents = opts.talents ?? [];
        return {
            system: { characteristics: opts.characteristics ?? {}, skills: opts.skills ?? {} },
            items: { some: (predicate) => talents.some((name) => predicate({ type: 'talent', name })) },
        };
    }

    beforeEach(() => {
        vi.stubGlobal('CONFIG', { wh40k: { characteristics: { weaponSkill: { abbreviation: 'WS' } } } });
        vi.stubGlobal('game', { i18n: { format: (key: string): string => key } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('passes when there are no prerequisites', () => {
        expect(checkPrerequisites(actorView(), [])).toEqual({ valid: true, unmet: [] });
    });

    it('passes a met characteristic prerequisite (abbreviation normalised)', () => {
        const result = checkPrerequisites(actorView({ characteristics: { weaponSkill: { total: 40 } } }), [{ type: 'characteristic', key: 'ws', value: 30 }]);
        expect(result.valid).toBe(true);
    });

    it('fails an unmet characteristic prerequisite', () => {
        const result = checkPrerequisites(actorView({ characteristics: { weaponSkill: { total: 20 } } }), [{ type: 'characteristic', key: 'ws', value: 30 }]);
        expect(result.valid).toBe(false);
        expect(result.unmet).toHaveLength(1);
    });

    it('reports an unknown characteristic', () => {
        const result = checkPrerequisites(actorView(), [{ type: 'characteristic', key: 'zzz', value: 30 }]);
        expect(result.valid).toBe(false);
        expect(result.unmet[0]).toContain('Unknown characteristic');
    });

    it('passes a present talent and fails a missing one', () => {
        expect(checkPrerequisites(actorView({ talents: ['hardy'] }), [{ type: 'talent', key: 'Hardy' }]).valid).toBe(true);
        expect(checkPrerequisites(actorView({ talents: [] }), [{ type: 'talent', key: 'Hardy' }]).valid).toBe(false);
    });

    it('passes a trained-skill prerequisite (display-name → key mapping)', () => {
        expect(checkPrerequisites(actorView({ skills: { dodge: skill({ trained: true }) } }), [{ type: 'skill', key: 'Dodge' }]).valid).toBe(true);
    });

    it('fails a missing skill', () => {
        expect(checkPrerequisites(actorView({ skills: {} }), [{ type: 'skill', key: 'Dodge' }]).valid).toBe(false);
    });

    it('fails when the skill is below the required +20 level', () => {
        expect(checkPrerequisites(actorView({ skills: { dodge: skill({ trained: true }) } }), [{ type: 'skill', key: 'Dodge', value: 20 }]).valid).toBe(false);
    });
});
