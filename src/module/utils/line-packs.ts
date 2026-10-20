/**
 * Which compendium packs hold one game line's content of one item category.
 *
 * The packs follow `<line>-<book>-items-<category>` (`bc-fate-items-psychic-powers`,
 * `ow-hammer-items-talents`), with an optional suffix for a sub-grouping
 * (`dh2-core-items-talents-specializations`). Selecting by that convention, instead
 * of naming each book, keeps a newly added book's pack visible (#674). Homebrew packs
 * (`hb-<line>-…`) start with `hb-`, not the line id, so they never match.
 */

/** Matches a pack name of `line`'s books in `category`. */
function lineBookPackPattern(line: string, category: string): RegExp {
    return new RegExp(`^${line}-[a-z0-9]+-items-${category}(?:-[a-z0-9-]+)?$`);
}

/** Is `packName` one of `line`'s book packs of `category` items? */
export function isLineBookPack(packName: string, line: string, category: string): boolean {
    return lineBookPackPattern(line, category).test(packName);
}

/**
 * One entry per name, case-insensitively. Across a line's books the same power can be
 * printed twice: an adventure restates a core power for its pregenerated characters
 * (Broken Chains' Doombolt). Where copies collide, the one `isPreferred` accepts wins
 * (the copy carrying the printed values); otherwise the first, in input order.
 * @param entries      Entries in pack order.
 * @param isPreferred  Whether an entry is the copy to keep over its namesakes.
 */
export function uniqueByName<T extends { name: string }>(entries: readonly T[], isPreferred: (entry: T) => boolean): T[] {
    const kept = new Map<string, T>();
    for (const entry of entries) {
        const key = entry.name.toLowerCase();
        const current = kept.get(key);
        if (current === undefined || (!isPreferred(current) && isPreferred(entry))) kept.set(key, entry);
    }
    return [...kept.values()];
}
