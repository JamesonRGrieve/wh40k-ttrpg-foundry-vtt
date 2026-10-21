/**
 * @file Which owned items contribute their `modifiers` to the actor.
 *
 * Talents, traits, conditions and special abilities always count; armour,
 * cybernetics and gear count only while equipped. Origin paths are left out:
 * they reach the actor through the origin-grant ledger and the origin-path
 * passes instead. One predicate serves both the derived item-modifier pass
 * (`CreatureTemplate._computeItemModifiers`) and the item resource ledger
 * (`WH40KBaseActor.syncItemResourceDeltas`), so a resource an item writes into
 * the stored totals is exactly the one the breakdowns list as its row (#691).
 */

/** The item surface the predicate reads. */
export interface ModifierBearingItem {
    type: string;
    isOriginPath: boolean;
    isTalent: boolean;
    isTrait: boolean;
    isCondition: boolean;
    isSpecialAbility: boolean;
    system: { state?: { equipped?: boolean | undefined } | undefined };
}

/** Item types whose modifiers apply only while the item is equipped. */
const EQUIP_GATED_TYPES: ReadonlySet<string> = new Set(['armour', 'cybernetic', 'gear']);

/** Whether an owned item's `modifiers` currently apply to its actor. */
export function contributesItemModifiers(item: ModifierBearingItem): boolean {
    if (item.isOriginPath) return false;
    // A Mark of Distinction's characteristic changes ride its modifiers map (#171);
    // other special abilities carry none.
    if (item.isTalent || item.isTrait || item.isCondition || item.isSpecialAbility) return true;
    return EQUIP_GATED_TYPES.has(item.type) && item.system.state?.equipped === true;
}
