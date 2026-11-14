/**
 * The severity levels a critical injury's sheet edits (#734).
 *
 * An injury stores one effect per severity level it defines. The sheet edits
 * each stored level and offers the next one after the highest, so an author can
 * add a level without editing JSON. Content-agnostic: no fixed level count.
 */
export function editableSeverities(stored: readonly number[]): number[] {
    const levels = [...new Set(stored.filter((level) => Number.isInteger(level) && level > 0))].sort((a, b) => a - b);
    return [...levels, (levels.at(-1) ?? 0) + 1];
}
