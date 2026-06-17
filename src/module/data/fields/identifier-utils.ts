/**
 * Pure identifier helpers, kept free of any Foundry dependency so they can be
 * unit-tested directly. {@link IdentifierField} extends a Foundry `StringField`
 * and therefore can't be imported under jsdom; this module holds the actual
 * slug logic the field (and item create-time backfill, #314) delegate to.
 */

/**
 * Generate a kebab-case identifier from a name string.
 * @param name  The name to convert.
 */
export function identifierFromName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Decide the identifier to backfill at item-create time (#314). An item that
 * already carries a non-empty identifier keeps it (returns `undefined`); a blank
 * or missing one is filled from the name, unless the name yields no usable slug.
 *
 * @param name     The item's name.
 * @param current  The current identifier, if the type has the field at all.
 */
export function identifierFromNameIfBlank(name: string, current: string | undefined): string | undefined {
    if (typeof current === 'string' && current !== '') return undefined;
    const generated = identifierFromName(name);
    return generated !== '' ? generated : undefined;
}
