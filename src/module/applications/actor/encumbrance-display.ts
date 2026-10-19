/**
 * @file The Inventory tab's Carry bar context (#545).
 *
 * Only actors whose document tracks encumbrance (the player-character document,
 * with its `encumbrance` getter) get the bar. An NPC's document has no getter, so
 * its sheet passes `tracksEncumbrance: false` and the header draws no bar and no
 * empty "/ KG". The template reads the flag; it never decides from the values.
 */

import type { WH40KEncumbrance } from '../../types/global.d.ts';

/** What the Carry bar renders from. The fill is present only when the actor tracks encumbrance. */
interface EncumbranceDisplay {
    tracksEncumbrance: boolean;
    encumbrancePercent?: number;
}

/** The Carry bar context for an actor document: the load as a 0–100 fill, a non-positive maximum counting as 1. Pure. */
export function encumbranceDisplay(actor: object): EncumbranceDisplay {
    if (!('encumbrance' in actor)) return { tracksEncumbrance: false };
    const enc = actor.encumbrance as WH40KEncumbrance;
    const max = enc.max > 0 ? enc.max : 1;
    return { tracksEncumbrance: true, encumbrancePercent: Math.min(100, Math.round((enc.value / max) * 100)) };
}
