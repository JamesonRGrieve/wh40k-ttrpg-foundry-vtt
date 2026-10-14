/**
 * @file hud-layer — keep a floating HUD readout below every window.
 *
 * The world-time widget is an ApplicationV2 window, so Foundry stacks it with
 * the sheets: every render with focus and every click raised it to the top
 * (`bringToFront` → `++_maxZ`), where it covered sheets opened near the top-left
 * and caught the clicks meant for them. A HUD readout belongs on Foundry's UI
 * layer (`--z-index-ui`, 60) — above the canvas and the interface chrome, below
 * every window (`--z-index-window`, 100 and up).
 */

/** Foundry's UI layer: above the canvas and sidebar chrome, below every window. */
export const HUD_LAYER_Z_INDEX = 'var(--z-index-ui)';

/** Pin `element` to the UI layer. Call it instead of raising the window. */
export function pinToHudLayer(element: HTMLElement): void {
    element.style.zIndex = HUD_LAYER_Z_INDEX;
}
