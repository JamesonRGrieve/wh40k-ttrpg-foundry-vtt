/**
 * Grid columns for the shared item table (`actor/partial/item-table.hbs`, #662).
 *
 * The table is a CSS grid. Its header row and every data row are subgrids
 * spanning all of its columns, so a header and the cells beneath it always
 * share a track. The tracks come from the caller's own header list: one per
 * header, plus a trailing track for the add button when the table has one.
 */

/** The part of an item-table header descriptor that sizes its column. */
export interface ItemTableColumn {
    /** Relative width of a flexible column (default 1); the name column is usually 2. */
    readonly weight?: number | undefined;
    /** Size the column to its content (a toolbar of icon buttons) instead of sharing the width. */
    readonly fit?: boolean | undefined;
}

/** The track a content-sized column takes: the add button and the per-row action toolbar. */
const FIT_TRACK = 'max-content';

function trackFor(column: ItemTableColumn): string {
    if (column.fit === true) return FIT_TRACK;
    const weight = column.weight !== undefined && Number.isFinite(column.weight) && column.weight > 0 ? column.weight : 1;
    return `minmax(0, ${weight}fr)`;
}

/**
 * The table's `grid-template-columns`: one track per header, then a
 * content-sized track for the add button / row toolbar when `hasAddColumn`.
 */
export function itemTableColumns(headers: readonly ItemTableColumn[], hasAddColumn: boolean): string {
    const tracks = headers.map(trackFor);
    if (hasAddColumn) tracks.push(FIT_TRACK);
    return tracks.join(' ');
}

/**
 * Handlebars entry: `{{itemTableColumns headers addAction}}`. Takes the raw
 * template values, so a missing header list yields no tracks and any truthy
 * `addAction` adds the trailing add-button track.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars passes raw template values; narrowed by the guard below
export function itemTableColumnsHelper(headers: unknown, addAction: unknown): string {
    const columns = Array.isArray(headers) ? headers.filter((header): header is ItemTableColumn => typeof header === 'object' && header !== null) : [];
    return itemTableColumns(columns, typeof addAction === 'string' ? addAction !== '' : addAction === true);
}
