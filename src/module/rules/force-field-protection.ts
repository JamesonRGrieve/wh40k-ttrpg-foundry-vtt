import type ForceFieldItemData from '../data/item/force-field.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';

/**
 * Force-field protection (#645). RAW is the same in every line: when the wearer
 * is attacked, roll 1d100. At or under the field's protection rating, the attack
 * is nullified. At or under the field's overload number, the field overloads and
 * stops working until it is repaired. That number comes from the item (DW's core
 * rules print one per field), or from its craftsmanship (Poor 01–15, Common
 * 01–10, Good 01–05, Best 01; the DH2, OW and BC rules).
 */

/** A force-field item: its `system` is the force-field DataModel. */
export type ForceFieldItem = WH40KItemDocument & { system: ForceFieldItemData };

/** Whether an owned item is a force field. */
export function isForceFieldItem(item: { readonly type: string }): item is ForceFieldItem {
    return item.type === 'forceField';
}

/** What a protection roll reads off the field: its rating and its overload band. */
export interface ForceFieldRollTerms {
    readonly protectionRating: number;
    readonly checksOverload: (roll: number) => boolean;
}

/**
 * The outcome of a protection roll's d100 total: protected at or under the
 * protection rating, overloaded inside the overload band (both can happen at once).
 * @param total  The d100 total.
 * @param field  The field's rating and overload band.
 */
export function forceFieldOutcome(total: number, field: ForceFieldRollTerms): { protected: boolean; overload: boolean } {
    return { protected: total <= field.protectionRating, overload: field.checksOverload(total) };
}
