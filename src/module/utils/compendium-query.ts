/**
 * Shared compendium pack-resolution helpers (#289).
 */

/**
 * Resolve a system compendium pack by its short name (e.g. `dh2-core-actors`).
 * Tries the fully-qualified id (`wh40k-rpg.<name>`) first, then falls back to a
 * `metadata.name` / `metadata.id` match. Returns `undefined` when no pack
 * matches. Centralizes the `game.packs.get(...) ?? game.packs.find(...)` idiom
 * that was copy-pasted across the origin-path builder.
 */
export function resolvePack(packName: string): ReturnType<typeof game.packs.get> {
    return game.packs.get(`wh40k-rpg.${packName}`) ?? game.packs.find((p) => p.metadata.name === packName || p.metadata.id === `wh40k-rpg.${packName}`);
}

/**
 * Filter the system's Item packs, load each pack's index with the requested
 * `fields`, and collect a flat array by applying `collect` to every index entry
 * (entries where `collect` returns `undefined` are skipped). Centralizes the
 * `game.packs.filter(...) → await getIndex({ fields }) → iterate` scaffold shared
 * by the compendium browser's source / category / result builders (#289).
 *
 * @param itemsOnly   when true, restrict to packs whose `documentName` is `'Item'`.
 * @param packFilter  when given, restrict to packs whose id it accepts, so a
 *                    lookup scoped to one line never cold-loads every line's index.
 */
export async function queryItemIndex<T>(
    fields: string[],
    collect: (entry: CompendiumIndexEntry, pack: { readonly metadata: { readonly id: string; readonly label: string } }) => T | undefined,
    itemsOnly = false,
    packFilter?: (packId: string) => boolean,
): Promise<T[]> {
    const packs = game.packs.filter(
        (p) => p.metadata.system === 'wh40k-rpg' && (!itemsOnly || p.documentName === 'Item') && (packFilter === undefined || packFilter(p.metadata.id)),
    );
    const perPack = await Promise.all(
        packs.map(async (pack) => {
            const index = await pack.getIndex({ fields });
            const out: T[] = [];
            for (const entry of index) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry getIndex() yields minimally-typed index entries; CompendiumIndexEntry is the narrowed surface consumers expect
                const value = collect(entry as unknown as CompendiumIndexEntry, pack);
                if (value !== undefined) out.push(value);
            }
            return out;
        }),
    );
    return perPack.flat();
}

/** One compendium Item matching a lookup, with the id of the pack it came from. */
interface IdentifiedPackEntry {
    uuid: string;
    packId: string;
}

/** Whether a pack id (`wh40k-rpg.<linePrefix>-…`) belongs to the given game line. Pure. */
export function isLinePack(packId: string, linePrefix: string): boolean {
    return (packId.split('.').at(1) ?? '').startsWith(`${linePrefix}-`);
}

/** Whether a pack id is the given line's own pack or that line's homebrew pack (`hb-<linePrefix>-…`). Pure. */
export function isLineOrHomebrewPack(packId: string, linePrefix: string): boolean {
    return isLinePack(packId, linePrefix) || isLinePack(packId, `hb-${linePrefix}`);
}

/**
 * Pick the entry from the given game line's packs (`wh40k-rpg.<linePrefix>-…`),
 * falling back to the first match from any line. Pure.
 */
export function pickLineEntry(entries: readonly IdentifiedPackEntry[], linePrefix: string): IdentifiedPackEntry | null {
    const onLine = entries.find((entry) => isLinePack(entry.packId, linePrefix));
    return onLine ?? entries.at(0) ?? null;
}

/** One compendium Item index entry, reduced to what an owned-item link recovery matches on. */
export interface LinkCandidate {
    uuid: string;
    packId: string;
    type: string;
    name: string;
    identifier: string;
}

/** What an owned item with no compendium link is matched by (#484). */
export interface OwnedItemLinkQuery {
    /** The owned item's type — a candidate of another type never matches. */
    type: string;
    /** The owned item's `system.identifier`, or `''` when it has none. */
    identifier: string;
    /** The owned item's name, matched exactly only when it has no identifier. */
    name: string;
    /** The OWNER's game line (`dh2`), which scopes the search to its packs and its homebrew packs. */
    linePrefix: string;
}

/**
 * The single canonical UUID an unlinked owned item resolves to, or `null`. Pure.
 *
 * The same talent exists in several lines under different UUIDs, so only the
 * owner's line (and that line's homebrew packs) is searched. An identifier match
 * is used when the item has one; an exact name match only when it has none. Any
 * result other than exactly one candidate is ambiguous or absent, and returns
 * `null` — a wrong link would graft another document's body onto the item.
 */
export function pickUniqueLinkCandidate(candidates: readonly LinkCandidate[], query: OwnedItemLinkQuery): string | null {
    const onLine = candidates.filter((c) => c.type === query.type && isLineOrHomebrewPack(c.packId, query.linePrefix));
    let matches: LinkCandidate[] = [];
    if (query.identifier !== '') matches = onLine.filter((c) => c.identifier === query.identifier);
    else if (query.name !== '') matches = onLine.filter((c) => c.name === query.name);
    return matches.length === 1 ? matches[0]?.uuid ?? null : null;
}

/**
 * Recover the compendium link of an owned item stored without one (#484): load
 * the owner line's Item pack indexes and pick the unique match. See
 * {@link pickUniqueLinkCandidate} for the matching rules.
 */
export async function recoverOwnedItemLink(query: OwnedItemLinkQuery): Promise<string | null> {
    const collect = (entry: CompendiumIndexEntry, pack: { readonly metadata: { readonly id: string } }): LinkCandidate | undefined => {
        if (entry.type !== query.type || entry.uuid === undefined) return undefined;
        const system = entry['system'];
        const identifier =
            typeof system === 'object' && system !== null && 'identifier' in system && typeof system.identifier === 'string' ? system.identifier : '';
        return { uuid: entry.uuid, packId: pack.metadata.id, type: entry.type, name: entry.name, identifier };
    };
    const candidates = await queryItemIndex(['system.identifier'], collect, true, (packId) => isLineOrHomebrewPack(packId, query.linePrefix));
    return pickUniqueLinkCandidate(candidates, query);
}

/**
 * UUID of the system compendium Item of `type` whose `system.identifier` is
 * `identifier`, preferring the given line's packs — so a mechanic can reach a
 * content document by its stable identifier instead of its name. The line's own
 * packs are searched first; every line's index is loaded only when they miss.
 */
export async function findItemUuidByIdentifier(type: string, identifier: string, linePrefix: string): Promise<string | null> {
    const collect = (entry: CompendiumIndexEntry, pack: { readonly metadata: { readonly id: string } }): IdentifiedPackEntry | undefined => {
        const system = entry['system'];
        if (entry.type !== type || typeof system !== 'object' || system === null) return undefined;
        if (!('identifier' in system) || system.identifier !== identifier || entry.uuid === undefined) return undefined;
        return { uuid: entry.uuid, packId: pack.metadata.id };
    };
    const onLine = (await queryItemIndex(['system.identifier'], collect, true, (packId) => isLinePack(packId, linePrefix))).at(0);
    if (onLine !== undefined) return onLine.uuid;
    return pickLineEntry(await queryItemIndex(['system.identifier'], collect, true), linePrefix)?.uuid ?? null;
}
