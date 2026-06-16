/**
 * Unit tests for equip-state effect gating (#333).
 *
 * `isEffectSuppressedByEquipState` is the shared predicate behind the actor's
 * `allApplicableEffects` override: an equippable item's transferred Active
 * Effects apply iff the item is equipped. Items with no `system.state` field
 * (talents, traits, conditions, origin paths) are always-on and never
 * suppressed. This mirrors the equip-gating already applied to item stat
 * modifiers (creature template) and passive Subtlety adjusters.
 */

import { describe, expect, it } from 'vitest';
import { isEffectSuppressedByEquipState } from './equip-state.ts';

describe('isEffectSuppressedByEquipState (#333)', () => {
    it('does not suppress when the item system is absent (no carrier)', () => {
        expect(isEffectSuppressedByEquipState(undefined)).toBe(false);
        expect(isEffectSuppressedByEquipState(null)).toBe(false);
    });

    it('does not suppress always-on items that have no state field (talents/traits)', () => {
        expect(isEffectSuppressedByEquipState({})).toBe(false);
    });

    it('does not suppress an equippable item that is equipped', () => {
        expect(isEffectSuppressedByEquipState({ state: { equipped: true } })).toBe(false);
    });

    it('suppresses an equippable item that is not equipped', () => {
        expect(isEffectSuppressedByEquipState({ state: { equipped: false } })).toBe(true);
    });
});
