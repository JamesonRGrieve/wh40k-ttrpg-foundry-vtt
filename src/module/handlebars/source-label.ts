/**
 * Format an item's `source` field into a display label (#229).
 *
 * `source` has two shapes across the item DataModels:
 *  - a structured object `{ book, page, url, … }` for every item that mixes
 *    `DescriptionTemplate` (weapons, armour, gear, traits, talents, psychic
 *    powers, origin paths, …);
 *  - a plain string for the handful that declare their own `StringField`
 *    (ammunition, vehicle-upgrade, npc-template).
 *
 * Templates that interpolated `{{item.system.source}}` directly printed the
 * literal `[object Object]` for the structured shape — and `{{#if}}` on the
 * object was always truthy, so the footer/badge showed even when there was no
 * real reference. This helper collapses either shape to a string, matching the
 * `DescriptionTemplate.sourceReference` getter's format, and returns `''` when
 * there is nothing to show (so callers can guard with `{{#if}}`).
 */

/** The reference-bearing fields this helper reads off a structured `source` object. */
interface SourceObject {
    book?: string;
    page?: string | number;
    url?: string;
}

/** Either `source` shape a template may hand this helper. */
export type SourceInput = string | SourceObject | null | undefined;

/** Coerce a `page` value (string or number) to a non-empty display string, or ''. */
function pageString(page: string | number | undefined): string {
    if (typeof page === 'number') return String(page);
    if (typeof page === 'string') return page;
    return '';
}

/**
 * Format a `source` value into a display label.
 * @returns The formatted reference (`"Book, p.12"` / `"Book"` / a URL / a raw
 *   string), or `''` when there is nothing to show.
 */
export function formatSourceLabel(source: SourceInput): string {
    if (typeof source === 'string') return source.trim();
    if (source === null || source === undefined) return '';

    const book = typeof source.book === 'string' ? source.book.trim() : '';
    const page = pageString(source.page).trim();
    const url = typeof source.url === 'string' ? source.url.trim() : '';

    if (book && page) return `${book}, p.${page}`;
    if (book) return book;
    if (url) return url;
    return '';
}
