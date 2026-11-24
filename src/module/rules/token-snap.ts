/**
 * @file Centring tokens smaller than one grid square (#774).
 *
 * Foundry rounds a token's size to the nearest half square before snapping, so a
 * 0.75-square token snaps as a one-square token: to the square's top-left vertex,
 * leaving it in the corner of its cell on every drag, drop, keyboard or ruler move.
 * A token smaller than a square instead sits centred in the square its own centre
 * falls in. Pure: the token document's `getSnappedPosition` applies it.
 */

/** A token's position and size, as `getSnappedPosition` receives them. */
export interface SnapInput {
    /** Top-left, in pixels. */
    x: number;
    y: number;
    /** Size in grid squares. */
    width: number;
    height: number;
}

/**
 * The top-left that centres a sub-square token in the square its centre is in, or
 * null when the token is a square or larger on that axis pair (core snapping
 * applies).
 * @param token     The candidate position and size.
 * @param gridSize  Pixels per square.
 */
export function centredSubSquarePosition(token: SnapInput, gridSize: number): { x: number; y: number } | null {
    if (!(gridSize > 0) || token.width >= 1 || token.height >= 1 || !(token.width > 0) || !(token.height > 0)) return null;
    const w = token.width * gridSize;
    const h = token.height * gridSize;
    const column = Math.floor((token.x + w / 2) / gridSize);
    const row = Math.floor((token.y + h / 2) / gridSize);
    return { x: column * gridSize + (gridSize - w) / 2, y: row * gridSize + (gridSize - h) / 2 };
}
