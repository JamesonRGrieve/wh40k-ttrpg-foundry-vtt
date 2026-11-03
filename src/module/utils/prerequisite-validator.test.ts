import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WH40K } from '../config.ts';
import { buildLangStub } from '../testing/lang-stub.ts';
import type { WH40KSkill } from '../types/global.d.ts';
import { checkPrerequisites, parsePrerequisiteString, type PrereqActorView, type PrereqItemView } from './prerequisite-validator.ts';

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
        vi.stubGlobal('game', { i18n: buildLangStub() });
        // Characteristic labels resolve through the runtime CONFIG.wh40k registry.
        vi.stubGlobal('CONFIG', { wh40k: WH40K });
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
        expect(result.unmet).toEqual(['Requires WS 30+ (current: 20)']);
    });

    it('resolves every short code and full key through the shared characteristic normaliser', () => {
        const characteristics = { fellowship: { total: 50 }, toughness: { total: 50 } };
        const unresolved = ['Fel', 'fel', 'fellowship', 'T', 'Tgh', 'toughness'].filter(
            (key) => !checkPrerequisites(actorView({ characteristics }), [{ type: 'characteristic', key, value: 40 }]).valid,
        );
        expect(unresolved).toEqual([]);
    });

    it('reports an unknown characteristic', () => {
        const result = checkPrerequisites(actorView(), [{ type: 'characteristic', key: 'zzz', value: 30 }]);
        expect(result.valid).toBe(false);
        expect(result.unmet).toEqual(['Unknown characteristic: zzz']);
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

    it('gates on Influence (an Inquisitor needs 75)', () => {
        const view = (influence: number | undefined): PrereqActorView => ({
            system: { characteristics: {}, skills: {}, influence },
            items: { some: () => false },
        });
        const gate = [{ type: 'influence' as const, key: 'influence', value: 75 }];
        expect(checkPrerequisites(view(75), gate).valid).toBe(true);
        expect(checkPrerequisites(view(42), gate).unmet).toEqual(['Requires Influence 75+ (current: 42)']);
        // An actor with no Influence at all has none.
        expect(checkPrerequisites(view(undefined), gate).unmet).toEqual(['Requires Influence 75+ (current: 0)']);
    });

    describe('origin prerequisites (an elite that needs, or rules out, another origin)', () => {
        const PSYKER = 'Compendium.wh40k-rpg.elites.Item.psyker';
        const UNTOUCHABLE = 'Compendium.wh40k-rpg.elites.Item.untouchable';
        const owning = (items: PrereqItemView[]): PrereqActorView => ({
            system: { characteristics: {}, skills: {} },
            items: { some: (predicate) => items.some(predicate) },
        });

        it('passes an origin the character owns, by compendium source or the legacy builder stamp', () => {
            const viaStats = owning([{ type: 'originPath', name: 'Psyker', _stats: { compendiumSource: PSYKER } }]);
            const viaFlag = owning([{ type: 'originPath', name: 'Psyker', flags: { core: { sourceId: PSYKER } } }]);
            expect(checkPrerequisites(viaStats, [{ type: 'origin', key: PSYKER }]).valid).toBe(true);
            expect(checkPrerequisites(viaFlag, [{ type: 'origin', key: PSYKER }]).valid).toBe(true);
        });

        it('fails a missing origin, and one held only as a same-named non-origin item', () => {
            expect(checkPrerequisites(owning([]), [{ type: 'origin', key: PSYKER }]).valid).toBe(false);
            expect(
                checkPrerequisites(owning([{ type: 'talent', name: 'Psyker', _stats: { compendiumSource: PSYKER } }]), [{ type: 'origin', key: PSYKER }]).valid,
            ).toBe(false);
        });

        it('rules out an origin the character owns (a Psyker cannot become Untouchable)', () => {
            const psyker = owning([{ type: 'originPath', name: 'Psyker', _stats: { compendiumSource: PSYKER } }]);
            expect(checkPrerequisites(psyker, [{ type: 'notOrigin', key: PSYKER }]).valid).toBe(false);
            expect(checkPrerequisites(psyker, [{ type: 'notOrigin', key: UNTOUCHABLE }]).valid).toBe(true);
        });
    });
});
