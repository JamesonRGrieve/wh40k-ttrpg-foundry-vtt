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
import { isEffectSuppressedByEquipState, isWeaponAttackBlockedByEquip } from './equip-state.ts';

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

describe('isWeaponAttackBlockedByEquip (#265)', () => {
    it('blocks an attack with an un-equipped weapon when enforcing (PCs)', () => {
        expect(isWeaponAttackBlockedByEquip({ state: { equipped: false } }, true)).toBe(true);
    });

    it('allows an attack with an equipped weapon when enforcing (PCs)', () => {
        expect(isWeaponAttackBlockedByEquip({ state: { equipped: true } }, true)).toBe(false);
    });

    it('never blocks when enforcement is off (NPCs attack with intrinsic profiles)', () => {
        expect(isWeaponAttackBlockedByEquip({ state: { equipped: false } }, false)).toBe(false);
        expect(isWeaponAttackBlockedByEquip({ state: { equipped: true } }, false)).toBe(false);
    });

    it('blocks a weapon missing its equipped flag when enforcing (defaults to not-drawn)', () => {
        expect(isWeaponAttackBlockedByEquip({ state: {} }, true)).toBe(true);
    });
});
