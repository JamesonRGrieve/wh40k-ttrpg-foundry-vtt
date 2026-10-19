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

/** Luminance (0–255) a disc pixel must exceed to count as part of a light disc. */
const LIGHT_DISC_THRESHOLD = 170;

/**
 * The on-screen width of the light disc centred on each canvas point, as a
 * fraction of `tokenSize` canvas pixels: what a viewer actually sees, measured off
 * a real screenshot rather than predicted from a texture and a configured scale.
 * Each disc is walked outwards along the centre row until a pixel at or below
 * {@link LIGHT_DISC_THRESHOLD} luminance (the canvas, a ring background or band).
 * The screenshot is decoded in the page (an <img> drawn to a 2D canvas), so no
 * image library is needed. Null when the canvas is not drawn.
 */
export async function lightDiscFractions(page: Page, centres: readonly CanvasPoint[], tokenSize: number): Promise<number[] | null> {
    const png = await page.screenshot({ type: 'png' });
    return page.evaluate(
        async (args: { data: string; centres: readonly CanvasPoint[]; tokenSize: number; threshold: number }): Promise<number[] | null> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global `canvas` is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { canvas?: { ready?: boolean; clientCoordinatesFromCanvas?: (p: CanvasPoint) => CanvasPoint } };
            const toClient = g.canvas?.clientCoordinatesFromCanvas?.bind(g.canvas);
            if (g.canvas?.ready !== true || toClient === undefined) return null;
            const img = new Image();
            img.src = `data:image/png;base64,${args.data}`;
            await img.decode();
            const surface = document.createElement('canvas');
            surface.width = img.naturalWidth;
            surface.height = img.naturalHeight;
            const ctx = surface.getContext('2d');
            if (ctx === null) return null;
            ctx.drawImage(img, 0, 0);
            // Screenshot pixels per CSS pixel (device scale factor).
            const ratio = img.naturalWidth / window.innerWidth;
            const pixels = ctx.getImageData(0, 0, surface.width, surface.height).data;
            const light = (x: number, y: number): boolean => {
                const i = (y * surface.width + x) * 4;
                return 0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0) > args.threshold;
            };
            return args.centres.map((centre) => {
                const c = toClient(centre);
                const edge = toClient({ x: centre.x + args.tokenSize, y: centre.y });
                const tokenPx = (edge.x - c.x) * ratio;
                const cx = Math.round(c.x * ratio);
                const cy = Math.round(c.y * ratio);
                let left = cx;
                let right = cx;
                while (left > 0 && light(left - 1, cy)) left--;
                while (right < surface.width - 1 && light(right + 1, cy)) right++;
                return light(cx, cy) ? (right - left + 1) / tokenPx : 0;
            });
        },
        { data: png.toString('base64'), centres, tokenSize, threshold: LIGHT_DISC_THRESHOLD },
    );
}
