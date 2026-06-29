import { describe, expect, it } from 'vitest';
import { getSituationalModifiers } from './attack-options';
import { deriveTargetSituationalKeys, targetCombatStateFromConditions, type TargetCombatState } from './target-situationals';

/**
 * Tests for auto-selecting combat situational modifiers from the target's
 * state (#393). The mapping is pure plumbing — it only emits keys that the
 * situational tables in attack-options.ts already define, so the modifier
 * values stay sourced from that single registry.
 */
describe('deriveTargetSituationalKeys (#393)', () => {
    const baseState: TargetCombatState = {
        isProne: false,
        isStunned: false,
        isUnaware: false,
        isHelpless: false,
        isRanged: true,
    };

    it('returns no keys when the target has no relevant state', () => {
        expect(deriveTargetSituationalKeys(baseState)).toEqual([]);
        expect(deriveTargetSituationalKeys({ ...baseState, isRanged: false })).toEqual([]);
    });

    it('selects the ranged Prone key for a prone target with a ranged attack', () => {
        expect(deriveTargetSituationalKeys({ ...baseState, isProne: true, isRanged: true })).toEqual(['prone']);
    });

    it('selects the melee Prone Target key for a prone target with a melee attack', () => {
        expect(deriveTargetSituationalKeys({ ...baseState, isProne: true, isRanged: false })).toEqual(['proneTarget']);
    });

    it('selects stunned, unaware, and helpless keys for both attack variants', () => {
        const flags = { isStunned: true, isUnaware: true, isHelpless: true };
        expect(deriveTargetSituationalKeys({ ...baseState, ...flags, isRanged: true })).toEqual(['stunnedTarget', 'unawareTarget', 'helplessTarget']);
        expect(deriveTargetSituationalKeys({ ...baseState, ...flags, isRanged: false })).toEqual(['stunnedTarget', 'unawareTarget', 'helplessTarget']);
    });

    it('only emits keys that exist in the chosen variant table', () => {
        for (const isRanged of [true, false]) {
            const available = new Set(getSituationalModifiers(isRanged).map((m) => m.key));
            const allActive: TargetCombatState = { isProne: true, isStunned: true, isUnaware: true, isHelpless: true, isRanged };
            for (const key of deriveTargetSituationalKeys(allActive)) {
                expect(available.has(key), `${key} missing from ${isRanged ? 'ranged' : 'melee'} situational table`).toBe(true);
            }
        }
    });

    it('produces a de-duplicated, order-stable list', () => {
        const keys = deriveTargetSituationalKeys({ isProne: true, isStunned: true, isUnaware: true, isHelpless: true, isRanged: true });
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual(['prone', 'stunnedTarget', 'unawareTarget', 'helplessTarget']);
    });
});

describe('targetCombatStateFromConditions (#393)', () => {
    it('maps direct condition tokens to their flags', () => {
        const state = targetCombatStateFromConditions(new Set(['prone', 'stunned']), true);
        expect(state).toMatchObject({ isProne: true, isStunned: true, isUnaware: false, isHelpless: false, isRanged: true });
    });

    it('collapses Surprised onto Unaware and Unconscious onto Helpless', () => {
        const surprised = targetCombatStateFromConditions(new Set(['surprised']), false);
        expect(surprised.isUnaware).toBe(true);

        const unconscious = targetCombatStateFromConditions(new Set(['unconscious']), false);
        expect(unconscious.isHelpless).toBe(true);
    });

    it('carries the ranged flag through unchanged', () => {
        expect(targetCombatStateFromConditions(new Set(), true).isRanged).toBe(true);
        expect(targetCombatStateFromConditions(new Set(), false).isRanged).toBe(false);
    });

    it('ignores unrelated conditions', () => {
        const state = targetCombatStateFromConditions(new Set(['manacled', 'fatigued', 'blinded']), true);
        expect(state).toMatchObject({ isProne: false, isStunned: false, isUnaware: false, isHelpless: false });
    });
});
