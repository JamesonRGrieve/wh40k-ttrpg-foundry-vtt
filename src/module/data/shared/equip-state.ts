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
