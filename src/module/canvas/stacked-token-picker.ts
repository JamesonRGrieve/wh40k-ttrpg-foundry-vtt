/**
 * Stacked-token picker (#569): a visible bust palette for choosing among tokens
 * that overlap the cursor.
 *
 * This system leans on stacked tokens constantly (bestiary mobs, reinforcements,
 * crowds of the same archetype), and Foundry's native click-to-cycle is invisible
 * and fiddly — you cannot see what you are cycling through, cannot jump to the one
 * you want, and same-art tokens are indistinguishable mid-cycle. When the cursor
 * is over a stack of two or more selectable tokens, this pops up a compact grid of
 * their circular busts; clicking a bust selects that token, even one fully beneath
 * the others.
 *
 * Per the 3-layer discipline, the geometry and ordering are PURE, unit-tested
 * helpers here; the canvas hook that draws the palette and wires selection is a
 * thin shell over them (see {@link registerStackedTokenPicker}), because the
 * canvas / DOM plumbing cannot be exercised without a live Foundry.
 */

/** A 2-D point in the coordinate space the query and bounds share. */
export interface Point {
    x: number;
    y: number;
}

/** An axis-aligned rectangle in the same coordinate space as {@link Point}. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The slice of a token the picker's PURE logic reads. The canvas shell adapts a
 * real Foundry `Token` placeable to this shape.
 */
export interface StackTokenLike {
    /** Stable id (the token document id) — the deterministic-ordering tiebreak. */
    id: string;
    /** Display name for the bust tooltip / aria label. */
    name: string;
    /** Vertical elevation; the primary ordering key (highest first). */
    elevation: number;
    /** Screen-space bounds, in the same space as the hover point. */
    bounds: Rect;
    /** Portrait image ref for the bust. */
    img: string;
    /** Whether the LOCAL user may select this token (visible AND controllable). */
    selectable: boolean;
}

/** True when `point` lies within (inclusive) the rectangle `rect`. */
function rectContains(rect: Rect, point: Point): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/**
 * The stack under `point`: every token whose bounds contain the point AND that
 * the local user may select. Tokens the user cannot see/control are excluded so
 * the palette never surfaces a token they could not otherwise reach (ownership /
 * visibility respected). Order is not defined here — call {@link orderStack}.
 */
export function detectStackAt(tokens: readonly StackTokenLike[], point: Point): StackTokenLike[] {
    return tokens.filter((token) => token.selectable && rectContains(token.bounds, point));
}

/**
 * A stack worth a palette: two or more selectable overlapping tokens. A single
 * token (or none) shows nothing — the picker only augments the ambiguous case.
 */
export function isStack(stack: readonly StackTokenLike[]): boolean {
    return stack.length >= 2;
}

/**
 * Deterministically order a stack for the palette: highest elevation first, then
 * name (A→Z), then id. The id tiebreak makes the order TOTAL, so a palette of
 * same-elevation same-name tokens (a mob of identical gangers) does not reshuffle
 * under the cursor between renders.
 */
export function orderStack(stack: readonly StackTokenLike[]): StackTokenLike[] {
    return [...stack].sort((a, b) => {
        if (a.elevation !== b.elevation) return b.elevation - a.elevation;
        if (a.name !== b.name) return a.name < b.name ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** Which side of the anchor the palette was placed on. */
type PaletteSide = 'left' | 'right';

/** The resolved on-screen placement of the palette. */
interface PalettePlacement {
    x: number;
    y: number;
    side: PaletteSide;
}

/**
 * Place the palette near a stack and keep it on-canvas. It prefers the LEFT of
 * the anchor (the top token's bounds); when that would clip the viewport's left
 * edge it flips to the right, and the top edge is clamped so the whole palette
 * stays within the viewport. A palette larger than the viewport is pinned to the
 * top-left corner rather than pushed off-screen.
 *
 * @param anchor    the stack's anchor rectangle (the top token's bounds).
 * @param palette   the palette's own {width, height}.
 * @param viewport  the on-canvas region the palette must stay inside.
 * @param gap       gap between the anchor and the palette (default 8px).
 */
export function computePalettePlacement(anchor: Rect, palette: { width: number; height: number }, viewport: Rect, gap = 8): PalettePlacement {
    const leftX = anchor.x - gap - palette.width;
    const rightX = anchor.x + anchor.width + gap;

    let side: PaletteSide = 'left';
    let x = leftX;
    if (leftX < viewport.x) {
        // Left would clip; flip to the right unless that clips worse than left.
        if (rightX + palette.width <= viewport.x + viewport.width) {
            side = 'right';
            x = rightX;
        } else {
            // Neither side fits cleanly — keep the preferred side and clamp below.
            x = leftX;
        }
    }
    // Clamp X within the viewport (a too-wide palette pins to the left edge).
    const maxX = viewport.x + viewport.width - palette.width;
    x = Math.max(viewport.x, Math.min(x, Math.max(viewport.x, maxX)));

    // Top-align to the anchor, clamped so the whole palette stays vertically in view.
    const maxY = viewport.y + viewport.height - palette.height;
    const y = Math.max(viewport.y, Math.min(anchor.y, Math.max(viewport.y, maxY)));

    return { x, y, side };
}

/**
 * The CSS `object-position` (percent x/y) that crops a DOM `<img>` bust to the
 * same subject the on-canvas token frame centres on. `cx`/`cy` are source-image
 * fractions (0–1); a null frame centres the image (50% / 50%). Mirrors the canvas
 * bust crop closely enough for the palette without the PIXI transform.
 */
export function bustObjectPosition(frame: { cx: number | null; cy: number | null } | null): string {
    const cx = frame?.cx ?? 0.5;
    const cy = frame?.cy ?? 0.5;
    const pct = (n: number): number => Math.round(Math.max(0, Math.min(1, n)) * 100);
    return `${pct(cx)}% ${pct(cy)}%`;
}
