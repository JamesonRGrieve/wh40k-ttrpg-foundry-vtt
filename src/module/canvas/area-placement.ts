/**
 * @file Drag-to-place an area on the canvas (#758).
 *
 * The user sees the area before it exists: a preview follows the pointer, and the clicks
 * that place it are taken before Foundry's canvas handling (so placing never selects a token).
 * - A circle or rectangle follows the pointer; a click places it.
 * - A cone or line is put down where the button is pressed and aimed by dragging; it is
 *   placed when the button is released.
 * - A cone or line anchored on a token (an attacker's Spray) only aims; a click places it.
 * Escape or a right-click cancels. The grid snaps the point unless Shift is held.
 */
import { type AreaRegionShape, areaOutline, bearingBetween, type PixelPoint, shapeIsAimed } from '../rules/area-region.ts';
import { pixelsPerUnit } from './area-regions.ts';

/** Where the user put the area: its origin and the bearing it points along. */
export interface AreaPlacement {
    origin: PixelPoint;
    rotation: number;
}

/** What is being placed. */
export interface PlacementRequest {
    shape: AreaRegionShape;
    /** Fill colour, a CSS hex string. */
    color: string;
    /** A fixed origin (an attacker's token): the user only aims. */
    anchor?: PixelPoint;
}

/** The live canvas the placement draws on and reads from. */
interface PlacementCanvas {
    board: HTMLCanvasElement;
    grid: NonNullable<typeof canvas.grid>;
    controls: NonNullable<typeof canvas.controls>;
}

/** The canvas pieces placement needs, or null before the canvas is ready. */
function placementCanvas(): PlacementCanvas | null {
    const board = document.querySelector<HTMLCanvasElement>('canvas#board');
    const { grid, controls } = canvas;
    if (board === null || grid === null || controls === undefined) return null;
    return { board, grid, controls };
}

/** The canvas point under the pointer, snapped to the grid unless Shift is held. */
function pointerPoint(event: PointerEvent, layers: PlacementCanvas): PixelPoint {
    const local = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
    const point = { x: local.x, y: local.y };
    if (event.shiftKey) return point;
    return layers.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.CENTER | CONST.GRID_SNAPPING_MODES.VERTEX });
}

/**
 * Let the user place an area on the canvas. Resolves with where it was put, or null when
 * the user cancelled or there is no canvas.
 *
 * The pointer is read from the board element in the capture phase, ahead of Foundry's
 * own canvas handling, so a click that places the area never also selects or moves a
 * token underneath it. The preview is drawn on the controls layer.
 */
export async function pickAreaPlacement(request: PlacementRequest): Promise<AreaPlacement | null> {
    const ppu = pixelsPerUnit();
    const layers = placementCanvas();
    if (ppu === null || layers === null || canvas.scene === null) return null;
    const aimed = shapeIsAimed(request.shape);
    const color = Number.parseInt(request.color.replace('#', ''), 16);
    const preview = new PIXI.Graphics();
    preview.eventMode = 'none';
    layers.controls.addChild(preview);
    const previousCursor = layers.board.style.cursor;
    layers.board.style.cursor = 'crosshair';

    let origin: PixelPoint | null = request.anchor ?? null;
    let rotation = 0;
    let dragging = false;

    const draw = (cursor: PixelPoint): void => {
        const at = origin ?? cursor;
        if (aimed && origin !== null) rotation = bearingBetween(origin, cursor);
        const points = areaOutline(request.shape, aimed && origin === null ? cursor : at, rotation, ppu);
        preview.clear();
        preview.lineStyle(3, color, 0.9);
        preview.beginFill(color, 0.25);
        preview.drawPolygon(points.flatMap((p) => [p.x, p.y]));
        preview.endFill();
    };

    return new Promise<AreaPlacement | null>((resolve) => {
        const listening = new AbortController();
        const finish = (placement: AreaPlacement | null): void => {
            listening.abort();
            layers.board.style.cursor = previousCursor;
            layers.controls.removeChild(preview);
            preview.destroy();
            resolve(placement);
        };
        /** Listen on the window in the capture phase, for events on the board only; Foundry never sees them. */
        const onBoard = (type: 'pointermove' | 'pointerdown' | 'pointerup' | 'contextmenu', handle: (event: PointerEvent) => void): void => {
            window.addEventListener(
                type,
                (event: Event) => {
                    if (event.target !== layers.board || !(event instanceof PointerEvent || event instanceof MouseEvent)) return;
                    event.stopPropagation();
                    if (type !== 'pointermove') event.preventDefault();
                    if (event instanceof PointerEvent) handle(event);
                },
                { capture: true, signal: listening.signal },
            );
        };
        window.addEventListener(
            'keydown',
            (event: KeyboardEvent) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                finish(null);
            },
            { signal: listening.signal },
        );
        onBoard('contextmenu', () => undefined);

        onBoard('pointermove', (event) => {
            const cursor = pointerPoint(event, layers);
            if (!aimed) origin = null;
            draw(cursor);
        });
        onBoard('pointerdown', (event) => {
            if (event.button === 2) {
                finish(null);
                return;
            }
            const cursor = pointerPoint(event, layers);
            if (!aimed) {
                finish({ origin: cursor, rotation: 0 });
                return;
            }
            if (request.anchor !== undefined) {
                finish({ origin: request.anchor, rotation: bearingBetween(request.anchor, cursor) });
                return;
            }
            origin = cursor;
            dragging = true;
        });
        onBoard('pointerup', (event) => {
            if (!dragging || origin === null) return;
            const cursor = pointerPoint(event, layers);
            finish({ origin, rotation: bearingBetween(origin, cursor) });
        });
    });
}
