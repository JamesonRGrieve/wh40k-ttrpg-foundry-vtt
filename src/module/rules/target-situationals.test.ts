import { describe, expect, it } from 'vitest';
import { shouldSkipSelfTargetDefenderMods, TARGET_GROUP_COLOR_CLASS, TARGET_GROUP_ORDER, targetDispositionGroup } from './target-situationals';

/**
 * The target-condition modifiers (Prone, Stunned, Unaware, …) are no longer
 * selected here from condition NAMES: they are the condition documents'
 * `system.targeted`, applied by the Path B collector — see
 * `targeted-conditions.test.ts`.
 */

describe('targetDispositionGroup (#400)', () => {
    it('maps Foundry token dispositions to groups (HOSTILE -1, NEUTRAL 0, FRIENDLY 1)', () => {
        expect(targetDispositionGroup(-1, false)).toBe('hostile');
        expect(targetDispositionGroup(0, false)).toBe('neutral');
        expect(targetDispositionGroup(1, false)).toBe('friendly');
    });

    it('falls back to neutral for SECRET / unset dispositions', () => {
        expect(targetDispositionGroup(-2, false)).toBe('neutral');
        expect(targetDispositionGroup(null, false)).toBe('neutral');
        expect(targetDispositionGroup(undefined, false)).toBe('neutral');
    });

    it('classifies the attacker as self regardless of disposition', () => {
        expect(targetDispositionGroup(-1, true)).toBe('self');
        expect(targetDispositionGroup(1, true)).toBe('self');
    });

    it('orders hostile → neutral → friendly → self, self last', () => {
        expect(TARGET_GROUP_ORDER.hostile).toBeLessThan(TARGET_GROUP_ORDER.neutral);
        expect(TARGET_GROUP_ORDER.neutral).toBeLessThan(TARGET_GROUP_ORDER.friendly);
        expect(TARGET_GROUP_ORDER.friendly).toBeLessThan(TARGET_GROUP_ORDER.self);
    });

    it('pairs each group with its red/white/green/yellow text colour', () => {
        expect(TARGET_GROUP_COLOR_CLASS.hostile).toContain('red');
        expect(TARGET_GROUP_COLOR_CLASS.neutral).toContain('white');
        expect(TARGET_GROUP_COLOR_CLASS.friendly).toContain('green');
        expect(TARGET_GROUP_COLOR_CLASS.self).toContain('yellow');
    });
});

describe('shouldSkipSelfTargetDefenderMods (#393)', () => {
    it('skips defender mods only when homebrew is on AND target is the attacker', () => {
        expect(shouldSkipSelfTargetDefenderMods(true, 'actor1', 'actor1')).toBe(true);
    });

    it('does not skip when homebrew self-targeting is off, even for a self target', () => {
        expect(shouldSkipSelfTargetDefenderMods(false, 'actor1', 'actor1')).toBe(false);
    });

    it('does not skip when the target is a different actor', () => {
        expect(shouldSkipSelfTargetDefenderMods(true, 'actor2', 'actor1')).toBe(false);
    });

    it('does not skip when either actor id is missing (cannot prove self)', () => {
        expect(shouldSkipSelfTargetDefenderMods(true, null, 'actor1')).toBe(false);
        expect(shouldSkipSelfTargetDefenderMods(true, 'actor1', null)).toBe(false);
        expect(shouldSkipSelfTargetDefenderMods(true, null, null)).toBe(false);
    });
});
