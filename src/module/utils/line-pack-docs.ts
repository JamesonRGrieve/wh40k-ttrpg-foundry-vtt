/**
 * Read every game line's book-pack index rows of one category, grouped by line.
 *
 * The per-line indexes built on `ready` (skill variants and specialisations,
 * weapon-quality mechanics) each need "the entries of every line's packs of one
 * category, tagged with the line". Packs are selected by their manifest flags
 * (`line-packs.ts`), never by a name. Rows come from the shared index request
 * (`pack-index.ts`), never from constructing whole documents (#706).
 */

import { packLineFlags } from './line-packs.ts';
import { type IndexablePack, readPackIndex } from './pack-index.ts';

/** One pack's index rows and the line it belongs to. */
export interface LinePackEntries<E> {
    readonly line: string;
    readonly entries: E[];
}

/**
 * The index rows of every non-homebrew pack of exactly `category`, each tagged
 * with its pack's line, in pack order.
 * @param packs     The installed packs (`game.packs`).
 * @param category  The pack category to read (`skills`).
 */
export async function loadLinePackIndex<E extends object>(packs: Iterable<IndexablePack<E>>, category: string): Promise<Array<LinePackEntries<E>>> {
    const sources: Array<{ line: string; pack: IndexablePack<E> }> = [];
    for (const pack of packs) {
        const flags = packLineFlags(pack.metadata);
        if (flags === null || flags.homebrew || flags.category !== category) continue;
        sources.push({ line: flags.line, pack });
    }
    return Promise.all(sources.map(async (source) => ({ line: source.line, entries: [...(await readPackIndex(source.pack))] })));
}
