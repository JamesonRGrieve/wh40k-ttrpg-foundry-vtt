/**
 * The source book of a compendium index entry, for the Compendium Browser's
 * Source grouping and filter (#658).
 *
 * The packs store `system.source` per game line, `{ rt: { book, page, … }, bc: {…} }`:
 * one document shared by several lines carries each line's own reference. The
 * index holds that raw shape (no DataModel resolves it), and the browser read
 * `source.book` off the top level, found nothing, and grouped all of its 167
 * results under "Unknown Source". A flat `{ book, … }` object and a plain string
 * (the shapes the DataModels expose) still resolve the same way.
 */

/** A value in a compendium index entry: the packs' JSON. */
type IndexValue = string | number | boolean | null | undefined | IndexObject | readonly IndexValue[];

interface IndexObject {
    readonly [key: string]: IndexValue;
}

/**
 * The game line a pack belongs to, from its id (`wh40k-rpg.rt-core-items-ammo` → `rt`):
 * the packs are named `<line>-<book>-<kind>`. A homebrew pack yields its own prefix
 * (`hb`), which names no line, so its entries fall back to their first reference.
 */
export function packLine(packId: string): string {
    const name = packId.slice(packId.indexOf('.') + 1);
    return name.split('-')[0] ?? '';
}

/** A non-empty trimmed string, or ''. */
function text(value: IndexValue): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: IndexValue): value is IndexObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The book (or legacy free-text reference) of one source reference. */
function bookOf(reference: IndexObject): string {
    const book = text(reference['book']);
    return book !== '' ? book : text(reference['custom']);
}

/** The source book of a `system.source` value, preferring the entry for `line`. */
function sourceBook(source: IndexValue, line: string): string {
    if (typeof source === 'string') return source.trim();
    if (!isObject(source)) return '';
    if ('book' in source || 'custom' in source) return bookOf(source);
    const own = source[line];
    const ownBook = isObject(own) ? bookOf(own) : '';
    if (ownBook !== '') return ownBook;
    for (const reference of Object.values(source)) {
        const book = isObject(reference) ? bookOf(reference) : '';
        if (book !== '') return book;
    }
    return '';
}

/**
 * The source book of an index entry's raw `system.source`, preferring the entry
 * for `line` (the pack's game line). Grouped by book alone, not page, so each
 * book is one group. '' when the entry names no source.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's compendium getIndex() payload, the packs' JSON, typed below as IndexValue
export function indexEntrySourceBook(rawSource: unknown, line: string): string {
    return sourceBook(rawSource as IndexValue, line);
}
