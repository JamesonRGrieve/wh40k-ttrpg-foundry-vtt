/**
 * Discovering another line's origins for the active line's builder (content#38).
 *
 * A homebrew conversion is one canonical origin, authored in the pack of the line
 * that prints it, carrying a branch for each line it is adapted to. The converted
 * line gets no stub in its own packs, so the builder reaches the conversion by
 * reading the other lines' origin packs and keeping each document that carries an
 * authored branch for the active line. "Carries a branch" is read from the
 * document's per-line `system.source` container (the container the variant
 * resolver keys a line's provenance on), never from a list of names.
 *
 * The compendium index holds the stored, un-materialized documents, so the
 * per-line containers are still intact there; the documents a pack's
 * `getDocuments()` returns have already been collapsed to one line.
 */

import { ALL_SYSTEM_IDS, type GameSystemId } from '../../config/game-systems/types.ts';
import { isLineVariantContainer, isPlainObject, systemForLine } from '../../utils/item-variant-utils.ts';
import { isLineOriginPack } from '../../utils/line-packs.ts';

/** The fields the discovery index loads: the type, the art, and the whole stored `system` with its per-line containers. */
export const DISCOVERY_INDEX_FIELDS: readonly string[] = ['type', 'img', 'system'];

/** A compendium index entry as the discovery reads it. */
export interface DiscoveryIndexEntry {
    _id: string;
    name?: string;
    img?: string;
    uuid?: string;
    type?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: a compendium index entry's stored `system` is untyped pack data, read structurally below
    system: Record<string, unknown>;
}

/** Is a compendium index entry one the discovery can read: an id and a stored `system` object? */
export function isDiscoveryIndexEntry(entry: object): entry is DiscoveryIndexEntry {
    return '_id' in entry && typeof entry._id === 'string' && 'system' in entry && isPlainObject(entry.system);
}

/** Does a stored per-line `system.source` container carry an authored branch for `line`? */
// eslint-disable-next-line no-restricted-syntax -- boundary: `source` is untyped stored pack data, fed straight into the isLineVariantContainer type guard
export function carriesLineBranch(source: unknown, line: GameSystemId): boolean {
    if (!isLineVariantContainer(source)) return false;
    const branch = source[line];
    return isPlainObject(branch) && typeof branch['provenance'] === 'string';
}

/** The origin packs, by name, of every line other than `line`. */
export function otherLineOriginPacks(packNames: readonly string[], line: GameSystemId): string[] {
    return packNames.filter((name) => ALL_SYSTEM_IDS.some((other) => other !== line && isLineOriginPack(name, other)));
}

/**
 * The index entries to add to `line`'s builder: origin-path documents that carry a
 * branch for `line` and are not already listed. `seen` holds the canonical ids
 * already listed (the line's own packs, then each entry this finds), so a
 * document reached through two packs lists once.
 */
export function discoverableEntries(entries: readonly DiscoveryIndexEntry[], line: GameSystemId, seen: Set<string>): DiscoveryIndexEntry[] {
    const found: DiscoveryIndexEntry[] = [];
    for (const entry of entries) {
        if (entry.type !== 'originPath' || seen.has(entry._id)) continue;
        if (!carriesLineBranch(entry.system['source'], line)) continue;
        seen.add(entry._id);
        found.push(entry);
    }
    return found;
}

/**
 * The raw document shape `normalizeOrigin` reads for a discovered entry: its
 * `system` resolved for `line`, with the stored per-line `source` kept on
 * `_source`, so the origin's official lines (and with them its adapted-homebrew
 * badge) come from the real provenance map.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the result is the raw compendium document shape normalizeOrigin accepts
export function discoveredOriginDocument(entry: DiscoveryIndexEntry, line: GameSystemId): Record<string, unknown> {
    return {
        _id: entry._id,
        uuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        type: entry.type,
        _source: { system: { source: structuredClone(entry.system['source']) } },
        system: systemForLine(entry.system, line),
    };
}
