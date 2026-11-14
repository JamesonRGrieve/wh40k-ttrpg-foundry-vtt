import { describe, expect, it } from 'vitest';
import { resolveAvailableHands } from '../../../rules/hand-budget.ts';
import { asCharacterSheet } from '../../../testing/sheet-stub.ts';
import { availableHands, prepareCombatVitals } from './combat-context.ts';
import type { CharacterSheetContext } from './sheet-support.ts';

/** The Combat tab's context, split out of the character sheet (#716). */
const sheet = asCharacterSheet({ actor: { system: {} } });

describe('prepareCombatVitals (#716)', () => {
    it('writes wounds and fatigue as capped percentages of their maxima', () => {
        const context: CharacterSheetContext = {};
        prepareCombatVitals.call(sheet, context, { wounds: { value: 6, max: 12 }, fatigue: { value: 5, max: 4 } });
        expect(context.woundsPercent).toBe(50);
        expect(context.fatiguePercent).toBe(100);
    });

    it('reads a missing or zero maximum as 1, so nothing divides by zero', () => {
        const context: CharacterSheetContext = {};
        prepareCombatVitals.call(sheet, context, { wounds: { value: 0, max: 0 }, fatigue: { value: 0 } });
        expect(context.woundsPercent).toBe(0);
        expect(context.fatiguePercent).toBe(0);
    });
});

describe('availableHands (#716)', () => {
    it('resolves the actor’s hands the way the hand budget does, defaulting when absent', () => {
        expect(availableHands.call(asCharacterSheet({ actor: { system: { hands: 4 } } }))).toBe(resolveAvailableHands(4));
        expect(availableHands.call(sheet)).toBe(resolveAvailableHands(undefined));
    });
});
