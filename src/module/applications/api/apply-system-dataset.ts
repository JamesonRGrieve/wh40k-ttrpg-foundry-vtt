/**
 * @file Shared game-system dataset stamp for app roots (#422/#462).
 *
 * `{{themeClassFor}}` reads `_gameSystemId` from the render context, but inline
 * per-system Tailwind variants (`bc:`/`dh2:`/…) resolve via a `[data-wh40k-system]`
 * ancestor. `ApplicationV2Mixin` pairs the context injection with this dataset
 * stamp; dialogs/HUDs that extend `HandlebarsApplicationMixin` directly call this
 * from their own `_onRender` so they surface BOTH halves instead of re-implementing
 * (and dropping) the stamp.
 */

/**
 * Stamp the resolved game-system id onto an app root element. No-op when the id is
 * unresolved — a system-agnostic app keeps its base colour rather than pinning to a
 * wrong line.
 */
export function applySystemDataset(element: HTMLElement, systemId: string | undefined): void {
    if (systemId !== undefined && systemId !== '') element.dataset['wh40kSystem'] = systemId;
}
