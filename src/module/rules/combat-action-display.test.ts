import { describe, expect, it } from 'vitest';
import { COMBAT_ACTION_TIMINGS, combatActionIcon, combatTimingKey, isCombatActionTiming } from './combat-action-display.ts';

describe('isCombatActionTiming', () => {
    it('accepts every enumerated timing', () => {
        for (const timing of COMBAT_ACTION_TIMINGS) {
            expect(isCombatActionTiming(timing)).toBe(true);
        }
    });

    it('rejects raw item types, empties, and nullish values', () => {
        for (const bad of ['weapon', 'talent', 'originPath', 'trait', '', 'HALF', 'reactionx']) {
            expect(isCombatActionTiming(bad)).toBe(false);
        }
        expect(isCombatActionTiming(undefined)).toBe(false);
        expect(isCombatActionTiming(null)).toBe(false);
    });
});

describe('combatTimingKey', () => {
    it('builds the langpack key for a valid timing', () => {
        expect(combatTimingKey('reaction')).toBe('WH40K.Combat.Actions.Timing.reaction');
        expect(combatTimingKey('half-full')).toBe('WH40K.Combat.Actions.Timing.half-full');
    });

    it('returns "" for a non-timing value so no badge renders (#245)', () => {
        for (const bad of ['weapon', 'talent', 'originPath', '', undefined, null]) {
            expect(combatTimingKey(bad)).toBe('');
        }
    });
});

describe('combatActionIcon', () => {
    it('prefers an explicit non-empty icon', () => {
        expect(combatActionIcon('fa-running', 'reaction')).toBe('fa-running');
        expect(combatActionIcon('fa-crosshairs', undefined)).toBe('fa-crosshairs');
    });

    it('falls back to a per-timing icon when the entry has none', () => {
        expect(combatActionIcon('', 'reaction')).toBe('fa-bolt');
        expect(combatActionIcon(undefined, 'full')).toBe('fa-hourglass');
        expect(combatActionIcon('   ', 'half')).toBe('fa-hourglass-half');
    });

    it('never returns an empty class — degraded entry gets the generic glyph', () => {
        expect(combatActionIcon('', 'weapon')).toBe('fa-circle-dot');
        expect(combatActionIcon(undefined, undefined)).toBe('fa-circle-dot');
        // The invariant that guards the "iconless button" symptom:
        expect(combatActionIcon('', '')).not.toBe('');
    });
});
