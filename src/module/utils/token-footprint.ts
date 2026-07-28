/**
 * Size descriptor → token footprint.
 *
 * The d100 lines score physical bulk on a 1–10 size scale (Miniscule …
 * Colossal, `CONFIG.WH40K.sizes`). Foundry expresses a token's canvas
 * footprint in grid squares. This module is the ONE place that maps between
 * them, so a Hulking NPC, a Hulking vehicle and the NPC sheet's "setup token"
 * button can never disagree about how big the thing is.
 *
 * Consumers: `documents/npc.ts` and `documents/vehicle.ts` stamp the footprint
 * at `_preCreate` (so a compendium-imported actor arrives at the right size
 * without a sheet ever being opened), and `applications/actor/npc-sheet.ts`
 * re-applies it from the sheet's token-setup action.
 */

/** Grid squares per size descriptor. Sizes off the scale fall back to 1×1. */
const SIZE_FOOTPRINTS: ReadonlyMap<number, number> = new Map([
    [1, 0.5], // Miniscule
    [2, 0.75], // Tiny
    [3, 1], // Small
    [4, 1], // Average
    [5, 2], // Hulking
    [6, 2], // Enormous
    [7, 3], // Massive
    [8, 3], // Immense
    [9, 4], // Gargantuan
    [10, 4], // Colossal
]);

/** Footprint used for an absent, non-numeric or off-scale size. */
export const DEFAULT_TOKEN_FOOTPRINT = 1;

/**
 * Resolve the token footprint (in grid squares) for a size descriptor.
 * @param {unknown} size  A 1–10 size descriptor; anything else yields the default.
 * @returns {number}  Grid squares along each axis.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: `size` arrives from Foundry's raw `_preCreate` create payload (untyped `Record<string, unknown>` index access); the typeof guard on the next line is the narrowing
export function tokenFootprintForSize(size: unknown): number {
    if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_TOKEN_FOOTPRINT;
    return SIZE_FOOTPRINTS.get(size) ?? DEFAULT_TOKEN_FOOTPRINT;
}

/**
 * Build the `prototypeToken` width/height update paths for a size descriptor.
 * Returned as dotted paths so it composes into an existing `_preCreate`
 * `updateSource` payload.
 * @param {unknown} size  A 1–10 size descriptor.
 * @returns {Record<string, number>}  `prototypeToken.width` / `.height`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: same raw `_preCreate` payload as `tokenFootprintForSize`, which narrows it
export function prototypeTokenFootprintUpdate(size: unknown): Record<string, number> {
    const footprint = tokenFootprintForSize(size);
    return {
        'prototypeToken.width': footprint,
        'prototypeToken.height': footprint,
    };
}

/**
 * Does the incoming `_preCreate` payload already declare a token footprint?
 * The size ladder supplies a DEFAULT — a pack author (or a duplicated actor)
 * that states its own `prototypeToken.width`/`.height` keeps it.
 * @param {unknown} createData  The raw `_preCreate` create payload.
 * @returns {boolean}  True when either dimension is explicitly authored.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `_preCreate` create payload, typed `never` by the framework; the typeof guard on the next line is the narrowing
export function hasAuthoredFootprint(createData: unknown): boolean {
    if (createData === null || typeof createData !== 'object') return false;
    // eslint-disable-next-line no-restricted-syntax -- boundary: `Reflect.get` on an untyped Foundry payload returns unknown; narrowed by the typeof guard below
    const proto: unknown = Reflect.get(createData, 'prototypeToken');
    if (proto === null || typeof proto !== 'object') return false;
    return typeof Reflect.get(proto, 'width') === 'number' || typeof Reflect.get(proto, 'height') === 'number';
}
