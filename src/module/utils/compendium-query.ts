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

/**
 * Pick the entry from the given game line's packs (`wh40k-rpg.<linePrefix>-…`),
 * falling back to the first match from any line. Pure.
 */
export function pickLineEntry(entries: readonly IdentifiedPackEntry[], linePrefix: string): IdentifiedPackEntry | null {
    const onLine = entries.find((entry) => isLinePack(entry.packId, linePrefix));
    return onLine ?? entries.at(0) ?? null;
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
