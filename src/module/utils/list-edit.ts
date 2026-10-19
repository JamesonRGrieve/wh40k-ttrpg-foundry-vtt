/**
 * Pure list edits for sheet add/remove actions, so each action writes the whole
 * array back in one update.
 */

/** The tag list with `raw` appended, trimmed; a blank or already-listed tag leaves it unchanged. */
export function appendTag(tags: readonly string[], raw: string): string[] {
    const tag = raw.trim();
    if (tag === '' || tags.includes(tag)) return [...tags];
    return [...tags, tag];
}

/** The list without its entry at `index`; an index out of range leaves it unchanged. */
export function withoutIndex<T>(list: readonly T[], index: number): T[] {
    return list.filter((_entry, at) => at !== index);
}
