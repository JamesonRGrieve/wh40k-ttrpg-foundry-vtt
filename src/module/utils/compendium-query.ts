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
 * @param itemsOnly  when true, restrict to packs whose `documentName` is `'Item'`.
 */
export async function queryItemIndex<T>(
    fields: string[],
    collect: (entry: CompendiumIndexEntry, pack: { readonly metadata: { readonly id: string; readonly label: string } }) => T | undefined,
    itemsOnly = false,
): Promise<T[]> {
    const packs = game.packs.filter((p) => p.metadata.system === 'wh40k-rpg' && (!itemsOnly || p.documentName === 'Item'));
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
