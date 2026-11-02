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

/**
 * An identifier in its canonical kebab-case form. Identifiers are generated
 * kebab-case from the name (`adamantium-faith`); documents authored earlier, and
 * owned items copied from them, may still carry the legacy camelCase form
 * (`adamantiumFaith`). Folding camelCase here lets both forms match, so a world
 * whose stored items predate the kebab-case packs needs no migration.
 */
export function canonicalIdentifier(identifier: string): string {
    return identifier.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** The item's `system.identifier` in canonical form, or `''` when it carries none. */
export function itemIdentifier(item: IdentifiableItem): string {
    const system = item.system;
    if (system === undefined || !('identifier' in system)) return '';
    return typeof system.identifier === 'string' ? canonicalIdentifier(system.identifier) : '';
}

/** Whether `items` holds an item of `type` whose `system.identifier` is `identifier` (in either form). */
export function hasItemWithIdentifier(items: Iterable<IdentifiableItem>, type: string, identifier: string): boolean {
    const wanted = canonicalIdentifier(identifier);
    for (const item of items) {
        if (item.type === type && itemIdentifier(item) === wanted) return true;
    }
    return false;
}
