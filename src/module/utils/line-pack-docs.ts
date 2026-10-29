/**
 * Load every game line's book-pack documents of one category, grouped by line.
 *
 * The per-line indexes built on `ready` (skill variants, skill specialisations)
 * each need "the documents of every line's skills packs, tagged with the line".
 * Packs are selected by their manifest flags (`line-packs.ts`), never by a name.
 */

import { packLineFlags, type PackMetadataLike } from './line-packs.ts';

/** The part of a Foundry compendium pack this loader reads. */
export interface LoadablePack<D> {
    readonly metadata: PackMetadataLike;
    getDocuments?: (() => Promise<D[]>) | undefined;
}

/** One pack's documents and the line it belongs to. */
export interface LinePackDocs<D> {
    readonly line: string;
    readonly docs: D[];
}

/**
 * The documents of every non-homebrew pack of exactly `category`, each tagged with
 * its pack's line, in pack order.
 * @param packs     The installed packs (`game.packs`).
 * @param category  The pack category to load (`skills`).
 */
export async function loadLinePackDocs<D>(packs: Iterable<LoadablePack<D>>, category: string): Promise<Array<LinePackDocs<D>>> {
    const sources: Array<{ line: string; getDocuments: () => Promise<D[]> }> = [];
    for (const pack of packs) {
        const flags = packLineFlags(pack.metadata);
        if (flags === null || flags.homebrew || flags.category !== category || pack.getDocuments === undefined) continue;
        // Bind to the owning pack — `getDocuments` reads `this.documentClass`
        // internally, so a detached reference would run with the wrong `this`.
        sources.push({ line: flags.line, getDocuments: pack.getDocuments.bind(pack) });
    }
    return Promise.all(sources.map(async (source) => ({ line: source.line, docs: await source.getDocuments() })));
}
