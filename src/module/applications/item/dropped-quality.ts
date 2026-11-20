/**
 * @file The weapon-quality drop shared by the item sheets that accept one: the psychic
 * power sheet (an attack special) and the weapon sheet (the weapon's own qualities, #745).
 */

/** A dropped weapon quality's fields the receiving sheets read. */
export interface DroppedQuality {
    type: string;
    name: string;
    system: { identifier: string; level: number | null };
}

/** Whether a dropped document (`fromUuid`'s result) is a weapon quality. */
export function isDroppedQuality(doc: Awaited<ReturnType<typeof fromUuid>>): doc is Awaited<ReturnType<typeof fromUuid>> & DroppedQuality {
    return doc instanceof Item && doc.type === 'weaponQuality';
}
