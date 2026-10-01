/**
 * Foundry-coupled ray-casting for line-of-sight + cover detection (#406).
 *
 * Casts rays from the attacker's token centre to sample points across the
 * target's footprint and asks Foundry's move-wall collision backend which are
 * blocked, then defers the classification to the PURE {@link resolveTargetVisibility}
 * in `rules/cover-detection.ts`. This half is Foundry-runtime-coupled and cannot
 * be unit-tested; it degrades gracefully (reports no block) when the canvas
 * collision backend is absent, and MUST be verified on real scenes (live / Tier B
 * e2e) before the detected cover is trusted. Intervening-token cover is a
 * follow-up — only walls are consulted here.
 */

import { type CoverEdge, rayPassesCover, resolveTargetVisibility, type TargetVisibility } from '../rules/cover-detection.ts';

/**
 * The flag scope a scene's low-cover walls are graded under: the Zephyr
 * Cartography module rings a table, a pew or rubble with walls that restrict
 * nothing and carry `cover` (0–1), so the cover a scene's builder meant is
 * found without a move-blocking wall. Absent the module, no wall carries it.
 */
const COVER_FLAG_SCOPE = 'zephyr-cartography';

/** How far past the target's own edge low cover still shields it, in grid squares: a figure crouched behind it. */
const COVER_REACH_SQUARES = 1;

interface Point {
    x: number;
    y: number;
}

interface TokenLike {
    center?: Point | null;
    bounds?: { x: number; y: number; width: number; height: number } | null;
}

/** Sample points across the target footprint as fractions of its bounds —
 *  centre, four edge midpoints, four corners (nine rays). */
const SAMPLE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.5],
    [0.5, 0.15],
    [0.5, 0.85],
    [0.15, 0.5],
    [0.85, 0.5],
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
];

/**
 * Whether a move-blocking wall lies between two points. Uses Foundry V14's
 * canvas polygon collision backend; returns false (no block) when the backend is
 * unavailable so detection degrades to "no cover" rather than throwing.
 */
function wallBlocks(origin: Point, dest: Point): boolean {
    // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.Canvas.polygonBackends is Foundry's untyped runtime canvas registry, absent from fvtt-types here.
    const backend = (CONFIG as unknown as { Canvas?: { polygonBackends?: { move?: { testCollision?: (o: Point, d: Point, opts: object) => unknown } } } })
        .Canvas?.polygonBackends?.move;
    if (typeof backend?.testCollision !== 'function') return false;
    return backend.testCollision(origin, dest, { type: 'move', mode: 'any' }) === true;
}

/**
 * Ray-cast from the attacker's token centre to sample points across the target's
 * footprint and classify line of sight + full/half cover (#406). Returns null
 * when either token lacks canvas geometry (off-scene / preview). The pure
 * classification lives in cover-detection.ts; this sampling + wall collision is
 * unverified without a live canvas.
 */
export function detectTargetVisibility(attacker: TokenLike, target: TokenLike): TargetVisibility | null {
    const origin = attacker.center;
    const bounds = target.bounds;
    if (origin == null || bounds == null) return null;
    const edges = sceneCoverEdges();
    const reach = Math.max(bounds.width, bounds.height) / 2 + COVER_REACH_SQUARES * gridSize();
    let blocked = 0;
    let covered = 0;
    for (const [fx, fy] of SAMPLE_OFFSETS) {
        const dest = { x: bounds.x + bounds.width * fx, y: bounds.y + bounds.height * fy };
        if (wallBlocks(origin, dest)) blocked++;
        else if (rayPassesCover(origin, dest, edges, reach)) covered++;
    }
    return resolveTargetVisibility(blocked, SAMPLE_OFFSETS.length, covered);
}

/** A wall as far as cover needs it: its segment and its flags, the grade read as whatever the flag holds. */
interface CoverWallLike {
    document?: { c?: readonly number[]; flags?: Record<string, { cover?: number | string | boolean | null } | undefined> } | null;
}

/** Foundry's default grid square in pixels. */
const DEFAULT_GRID_PX = 100;

/** The scene's low-cover edges: walls graded with `cover` under the cartography module's flags; none without a canvas. */
function sceneCoverEdges(): CoverEdge[] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.walls is Foundry's untyped runtime placeables layer here.
    const walls = (globalThis as { canvas?: { walls?: { placeables?: readonly CoverWallLike[] } } }).canvas?.walls?.placeables ?? [];
    return walls.flatMap((wall) => {
        const c = wall.document?.c;
        const grade = wall.document?.flags?.[COVER_FLAG_SCOPE]?.cover;
        if (c === undefined || c.length < 4 || typeof grade !== 'number') return [];
        const [ax = 0, ay = 0, bx = 0, by = 0] = c;
        return [{ a: { x: ax, y: ay }, b: { x: bx, y: by }, grade }];
    });
}

/** The scene's grid square in pixels; a hundred without a canvas. */
function gridSize(): number {
    // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.grid is Foundry's untyped runtime grid here.
    return (globalThis as { canvas?: { grid?: { size?: number } } }).canvas?.grid?.size ?? DEFAULT_GRID_PX;
}
