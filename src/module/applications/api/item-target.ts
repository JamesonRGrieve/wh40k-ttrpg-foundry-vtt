/**
 * @file Owned-item resolution from a clicked sheet control.
 *
 * The `data-item-id` lookup (closest ancestor, falling back to the element's
 * own dataset) was hand-rolled in ~a dozen actor-sheet action handlers. This
 * pure helper centralises the id extraction so it stays consistent; the
 * notify-on-miss wrapper lives on BaseActorSheet (_resolveItemFromTarget).
 */

/**
 * Resolve the `data-item-id` for a clicked control. Uses `closest` so a click
 * on a child icon still resolves, then falls back to the element's own
 * dataset. Returns `undefined` for absent / empty ids.
 */
export function itemIdFromTarget(target: HTMLElement): string | undefined {
    const id = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'] ?? target.dataset['itemId'];
    return id !== undefined && id !== '' ? id : undefined;
}
