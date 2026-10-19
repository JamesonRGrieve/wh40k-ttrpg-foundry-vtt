/**
 * @file The Inventory tab's Carry bar context (#545).
 *
 * Only actors whose document tracks encumbrance (the player-character document,
 * with its `encumbrance` getter) get the bar. An NPC's document has no getter, so
 * its sheet passes `tracksEncumbrance: false` and the header draws no bar and no
 * empty "/ KG". The template reads the flag; it never decides from the values.
 */

import type { WH40KEncumbrance } from '../../types/global.d.ts';

/** What the Carry bar renders from. The percentages are present only when the actor tracks encumbrance. */
interface EncumbranceDisplay {
    tracksEncumbrance: boolean;
    encumbrancePercent?: number;
    backpackPercent?: number;
}

/** A fill percentage, 0–100; a missing or non-positive maximum counts as 1. Pure. */
function fillPercent(value: number | undefined, max: number | undefined): number {
    const cap = max !== undefined && max > 0 ? max : 1;
    return Math.min(100, Math.round(((value ?? 0) / cap) * 100));
}

/** The Carry bar context for an actor document. Pure. */
export function encumbranceDisplay(actor: object): EncumbranceDisplay {
    if (!('encumbrance' in actor)) return { tracksEncumbrance: false };
    const enc = actor.encumbrance as WH40KEncumbrance;
    return {
        tracksEncumbrance: true,
        encumbrancePercent: fillPercent(enc.value, enc.max),
        backpackPercent: fillPercent(enc.backpack_value, enc.backpack_max),
    };
}
