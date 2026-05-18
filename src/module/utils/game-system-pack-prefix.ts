/**
 * Map an actor / item `system.gameSystem` value to the pack-name prefix used
 * by the compendium packs. Actor documents use the edition-suffixed variant
 * (e.g. `dh2e`) but the packs were authored without it (`dh2-core-items`).
 * Strip the trailing `e` for the two Dark Heresy editions to bridge the two;
 * every other system id (and an absent value) passes through unchanged.
 *
 * Content-agnostic: this is a fixed system-mechanics mapping over the seven
 * `GameSystemId` values, not compendium content (Direction #7).
 */
export function gameSystemPackPrefix(gameSystem: string | undefined): string {
    if (gameSystem === 'dh1e') return 'dh1';
    if (gameSystem === 'dh2e') return 'dh2';
    return gameSystem ?? '';
}
