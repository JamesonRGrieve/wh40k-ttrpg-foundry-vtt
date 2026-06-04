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
