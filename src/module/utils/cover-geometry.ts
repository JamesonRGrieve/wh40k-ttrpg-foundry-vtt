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

import { resolveTargetVisibility, type TargetVisibility } from '../rules/cover-detection.ts';

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
    let blocked = 0;
    for (const [fx, fy] of SAMPLE_OFFSETS) {
        if (wallBlocks(origin, { x: bounds.x + bounds.width * fx, y: bounds.y + bounds.height * fy })) blocked++;
    }
    return resolveTargetVisibility(blocked, SAMPLE_OFFSETS.length);
}
