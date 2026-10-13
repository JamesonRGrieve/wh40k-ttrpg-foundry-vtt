import type { Page } from '@playwright/test';

/** A viewport rectangle in CSS pixels, as `page.screenshot({ clip })` takes it. */
export interface ClipRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A point in canvas (scene) pixels. */
export interface CanvasPoint {
    x: number;
    y: number;
}

/**
 * The viewport rectangle that frames `points` (canvas pixels) on the live canvas,
 * padded by `padScene` canvas pixels on every side and clamped to the viewport, for
 * `snap(page, label, { clip })`. Collapses the sidebar first so it does not cover
 * the right edge of the frame. Null when the canvas is not drawn.
 */
export async function canvasClip(page: Page, points: readonly CanvasPoint[], padScene: number): Promise<ClipRect | null> {
    return page.evaluate(
        async (args: { points: readonly CanvasPoint[]; pad: number }): Promise<ClipRect | null> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (`canvas`, `ui`) are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                canvas?: { ready?: boolean; clientCoordinatesFromCanvas?: (p: CanvasPoint) => CanvasPoint };
                ui?: { sidebar?: { expanded?: boolean; collapse?: () => void } };
            };
            const toClient = g.canvas?.clientCoordinatesFromCanvas?.bind(g.canvas);
            if (g.canvas?.ready !== true || toClient === undefined || args.points.length === 0) return null;
            if (g.ui?.sidebar?.expanded === true) {
                g.ui.sidebar.collapse?.();
                await globalThis.wh40kE2E.settle(400);
            }
            const xs = args.points.flatMap((p) => [p.x - args.pad, p.x + args.pad]);
            const ys = args.points.flatMap((p) => [p.y - args.pad, p.y + args.pad]);
            const topLeft = toClient({ x: Math.min(...xs), y: Math.min(...ys) });
            const bottomRight = toClient({ x: Math.max(...xs), y: Math.max(...ys) });
            const x = Math.max(0, Math.floor(topLeft.x));
            const y = Math.max(0, Math.floor(topLeft.y));
            const width = Math.min(window.innerWidth, Math.ceil(bottomRight.x)) - x;
            const height = Math.min(window.innerHeight, Math.ceil(bottomRight.y)) - y;
            return width > 0 && height > 0 ? { x, y, width, height } : null;
        },
        { points, pad: padScene },
    );
}
