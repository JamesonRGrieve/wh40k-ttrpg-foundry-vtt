/**
 * @file Where two tokens are measured from, and when they count as engaged.
 *
 * Range is the distance between the two figures, not between their corners: a
 * token's x/y is its top-left, so measuring corner to corner reads a large target
 * as further than it is. On a square grid the measurement runs between the two
 * footprints' nearest cells; on other grids, between the tokens' centres.
 *
 * Two figures in neighbouring cells, diagonals included, are engaged in melee. A
 * ranged attack between them gets no range bonus, so the distance reads as melee
 * reach (one metre) whichever diagonal rule the world measures with. That holds
 * only while a cell is a figure's reach (two metres or less); on a coarser map,
 * neighbouring cells are simply that far apart.
 */

/** A token's footprint: its top-left in pixels and its size in grid cells. */
export interface TokenBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A point on the canvas, in pixels. */
export interface CanvasPoint {
    x: number;
    y: number;
}

/** The grid a distance is measured on. */
export interface GridGeometry {
    /** Pixels per cell. */
    size: number;
    /** Whether cells are squares (footprints are measured cell to cell). */
    square: boolean;
}

/** The two points to measure between, and whether the footprints are in neighbouring (or the same) cells. */
export interface MeasurePoints {
    from: CanvasPoint;
    to: CanvasPoint;
    adjacent: boolean;
}

/** The cell index nearest the other span, for two spans of cells on one axis. */
function nearestIndices(a0: number, aCount: number, b0: number, bCount: number): [number, number] {
    const a1 = a0 + Math.max(1, aCount) - 1;
    const b1 = b0 + Math.max(1, bCount) - 1;
    if (b0 > a1) return [a1, b0];
    if (a0 > b1) return [a0, b1];
    const shared = Math.max(a0, b0);
    return [shared, shared];
}

/** The points to measure between two footprints on `grid`. */
export function measurePoints(a: TokenBox, b: TokenBox, grid: GridGeometry): MeasurePoints {
    if (!grid.square || !(grid.size > 0)) {
        const boxCentre = (box: TokenBox): CanvasPoint => ({ x: box.x + (box.width * grid.size) / 2, y: box.y + (box.height * grid.size) / 2 });
        return { from: boxCentre(a), to: boxCentre(b), adjacent: false };
    }
    const cell = (px: number): number => Math.round(px / grid.size);
    const [aj, bj] = nearestIndices(cell(a.x), Math.round(a.width), cell(b.x), Math.round(b.width));
    const [ai, bi] = nearestIndices(cell(a.y), Math.round(a.height), cell(b.y), Math.round(b.height));
    const centre = (i: number, j: number): CanvasPoint => ({ x: (j + 0.5) * grid.size, y: (i + 0.5) * grid.size });
    return { from: centre(ai, aj), to: centre(bi, bj), adjacent: Math.abs(ai - bi) <= 1 && Math.abs(aj - bj) <= 1 };
}

/** The most a cell may span, in metres, for neighbouring cells to be within reach. */
const ENGAGED_CELL_METRES = 2;

/** Melee reach, in metres: the distance two engaged figures read as. */
export const ENGAGED_DISTANCE_METRES = 1;

/**
 * The distance between two figures in metres.
 * @param flatMetres      The measured ground distance between the points, in metres.
 * @param elevationMetres The difference in elevation, in metres.
 * @param adjacent        Whether the footprints are in neighbouring cells.
 * @param cellMetres      One cell's side, in metres.
 */
export function figureDistance(flatMetres: number, elevationMetres: number, adjacent: boolean, cellMetres: number): number {
    const level = Math.abs(elevationMetres) <= ENGAGED_DISTANCE_METRES;
    if (adjacent && level && cellMetres > 0 && cellMetres <= ENGAGED_CELL_METRES) return ENGAGED_DISTANCE_METRES;
    return Math.floor(Math.hypot(flatMetres, elevationMetres));
}
