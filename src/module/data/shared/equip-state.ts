/**
 * Foundry-free equip-state predicates shared by the DataModel layer and the
 * Document layer. Kept separate from `equippable-template.ts` (which extends a
 * Foundry global and so cannot be imported outside the Foundry runtime) so the
 * pure logic is unit-testable on its own.
 */

/**
 * Whether an owned item's transferred Active Effects (and any other
 * equip-conditional contribution) must be suppressed because the item is
 * equippable but not currently equipped (#333). Items that declare no
 * `system.state` at all — talents, traits, conditions, origin paths — are
 * always-on and never suppressed; only `EquippableTemplate` items carry
 * `state`, and they always carry `state.equipped`. Mirrors the equip-gating
 * already applied to item stat modifiers (creature template) and passive
 * Subtlety adjusters (base actor).
 *
 * @param itemSystem  The item's `system` data (only `state.equipped` is read).
 * @returns           `true` when the item's effects should NOT apply.
 */
export function isEffectSuppressedByEquipState(itemSystem: { state?: { equipped?: boolean } } | null | undefined): boolean {
    const state = itemSystem?.state;
    if (state === undefined) return false;
    return state.equipped !== true;
}

/**
 * Whether a weapon's combat action must be refused because the weapon is not
 * equipped (#265). A combat action (attack roll) requires the weapon to be
 * drawn/equipped; a stowed weapon cannot be fired or swung until it is drawn.
 * Enforcement is gated by `enforce` so PCs (whose weapons are explicitly
 * equipped) require the equipped state, while NPCs — who attack with intrinsic
 * profiles and don't track per-weapon draw state — opt out by passing `false`.
 *
 * @param itemSystem  The weapon's `system` data (only `state.equipped` is read).
 * @param enforce     Whether the equipped requirement applies (PCs: `true`).
 * @returns           `true` when the attack should be refused.
 */
export function isWeaponAttackBlockedByEquip(itemSystem: { state?: { equipped?: boolean } } | null | undefined, enforce: boolean): boolean {
    if (!enforce) return false;
    return isEffectSuppressedByEquipState(itemSystem);
}
