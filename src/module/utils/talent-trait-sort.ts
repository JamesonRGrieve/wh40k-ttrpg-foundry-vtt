/**
 * @file Alphabetical ordering for talent/trait display lists.
 *
 * The sheet augments talents/traits into plain display objects and groups them
 * by tier / category, but the order within each group followed the actor's item
 * insertion order. These helpers give a stable, locale-aware A→Z ordering by the
 * composed display name, applied before grouping so both the flat lists and the
 * grouped lists render alphabetically. Pure and content-agnostic — no Foundry
 * globals — so the ordering is unit-testable without a live sheet.
 */

/** The display fields the ordering reads: the composed `fullName`, falling back to `name`. */
interface DisplayNamed {
    fullName?: string;
    name?: string;
}

/**
 * Display-name sort key for a talent/trait display object: the composed
 * `fullName` (e.g. `"Weapon Training (Solid Projectile)"`), falling back to the
 * bare `name`.
 *
 * @param item A talent/trait display object.
 * @returns The string to sort on (empty when neither field is set).
 */
export function talentTraitSortKey(item: DisplayNamed): string {
    const fullName = item.fullName;
    if (fullName !== undefined && fullName !== '') return fullName;
    return item.name ?? '';
}

/**
 * Sort talent/trait display objects alphabetically by their display name,
 * locale-aware and case-insensitive. Mutates and returns the array, like
 * {@link Array.prototype.sort}.
 *
 * @param items Display objects to order.
 * @param lang  BCP-47 language tag (e.g. `game.i18n.lang`) for locale-aware collation.
 * @returns The same array, sorted in place.
 */
export function sortByDisplayName<T extends DisplayNamed>(items: T[], lang: string): T[] {
    return items.sort((a, b) => talentTraitSortKey(a).localeCompare(talentTraitSortKey(b), lang, { sensitivity: 'base' }));
}
