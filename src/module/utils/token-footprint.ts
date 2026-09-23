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
 * re-applies it from the sheet's token-setup action. At token creation
 * (`documents/token.ts`) the scene grid is known, so an actor with an authored
 * physical `footprint` (metres) is refined to its W×H cell footprint (#582).
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

/** Metres → one unit of each length unit a scene grid may be measured in. */
const UNITS_PER_METRE: ReadonlyMap<string, number> = new Map([
    ['ft', 3.28084],
    ['feet', 3.28084],
    ['foot', 3.28084],
    ['yd', 1.09361],
    ['yards', 1.09361],
    ['km', 0.001],
    ['mi', 0.000621371],
    ['miles', 0.000621371],
]);

/**
 * Convert metres into a scene's grid units. Metres (`m`, `meters`, `metres`),
 * a blank unit and any unrecognised unit are treated as metric — the d100 lines
 * measure in metres.
 * @param metres  A length in metres.
 * @param units   The scene's `grid.units` label.
 */
export function metresToSceneUnits(metres: number, units: string | null | undefined): number {
    return metres * (UNITS_PER_METRE.get((units ?? '').trim().toLowerCase()) ?? 1);
}

/** The scene grid a footprint is laid out on. */
export interface GridScale {
    /** Scene units per grid cell (`scene.grid.distance`). */
    distance: number;
    /** The unit label (`scene.grid.units`). */
    units: string;
}

/** An actor's authored physical footprint in metres. */
export interface PhysicalDimensions {
    length: number | null;
    width: number | null;
}

/**
 * The W×H grid-cell footprint for an actor with authored dimensions, or `null`
 * when either dimension or the grid is missing. The token lies lengthwise across
 * the grid (width ← length, height ← width), matching side-profile vehicle art.
 * Each side rounds to the nearest whole cell, never below one.
 * @param dimensions  The actor's `system.footprint` (metres).
 * @param grid        The scene grid.
 */
export function dimensionFootprint(
    dimensions: PhysicalDimensions | null | undefined,
    grid: GridScale | null | undefined,
): { width: number; height: number } | null {
    if (dimensions == null || grid == null || !(grid.distance > 0)) return null;
    const { length, width } = dimensions;
    if (length === null || width === null || !(length > 0) || !(width > 0)) return null;
    const cells = (metres: number): number => Math.max(1, Math.round(metresToSceneUnits(metres, grid.units) / grid.distance));
    return { width: cells(length), height: cells(width) };
}

/** The actor/token facts the token preset reads. */
export interface TokenPresetInput {
    /** The token's current width/height (inherited from the prototype or authored). */
    currentWidth?: number | null | undefined;
    currentHeight?: number | null | undefined;
    /** The owning actor's 1–10 size descriptor. */
    size?: number | null | undefined;
    /** The owning actor's authored physical footprint (metres). */
    dimensions?: PhysicalDimensions | null | undefined;
    /** The scene grid the token is placed on. */
    grid?: GridScale | null | undefined;
    /** Overwrite a footprint that looks hand-set (the sheet's explicit setup action). */
    force?: boolean;
}

/**
 * The footprint update to preset from the owning actor's compendium data, as a
 * dotted-path payload for `TokenDocument#updateSource`. Empty when nothing needs
 * changing.
 *
 * Authored `dimensions` win (W×H cells for the scene's grid); otherwise the
 * square size-ladder footprint (Hulking → 2×2, Massive → 3×3, …). The preset only
 * replaces a DEFAULT footprint — still 1×1, or still the square ladder stamp the
 * actor's `_preCreate` wrote — so a hand-resized token is never clobbered unless
 * `force` is set.
 * @param {TokenPresetInput} input  The actor/token facts.
 * @returns {Record<string, number>}  `width` / `height` updates (may be empty).
 */
export function tokenPresetFromActor(input: TokenPresetInput): Record<string, number> {
    const ladder = tokenFootprintForSize(input.size);
    const currentWidth = input.currentWidth ?? 1;
    const currentHeight = input.currentHeight ?? 1;
    const isDefault = (currentWidth === 1 && currentHeight === 1) || (currentWidth === ladder && currentHeight === ladder);
    if (input.force !== true && !isDefault) return {};

    const target = dimensionFootprint(input.dimensions, input.grid) ?? { width: ladder, height: ladder };
    if (target.width === currentWidth && target.height === currentHeight) return {};
    return { width: target.width, height: target.height };
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
