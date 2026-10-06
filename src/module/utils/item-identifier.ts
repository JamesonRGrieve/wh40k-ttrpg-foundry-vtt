/**
 * Match owned / compendium items by their stable `system.identifier` — the key
 * a mechanic uses to find its content document instead of a display name
 * (Direction #7). Structural, so it accepts live Foundry items and plain test
 * doubles alike.
 */

/** An item as far as identifier matching reads it. */
export interface IdentifiableItem {
    type?: string | undefined;
    system?: object | undefined;
}

/** The item's `system.identifier`, or `''` when it carries none. */
export function itemIdentifier(item: IdentifiableItem): string {
    const system = item.system;
    if (system === undefined || !('identifier' in system)) return '';
    return typeof system.identifier === 'string' ? system.identifier : '';
}

/** Whether `items` holds an item of `type` whose `system.identifier` is `identifier`. */
export function hasItemWithIdentifier(items: Iterable<IdentifiableItem>, type: string, identifier: string): boolean {
    for (const item of items) {
        if (item.type === type && itemIdentifier(item) === identifier) return true;
    }
    return false;
}
