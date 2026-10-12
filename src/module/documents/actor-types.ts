/**
 * @file Pure actor-type predicates, kept in a leaf module so UI code can ask
 * "is this a player character?" without importing the whole Actor document
 * (and its dependency graph).
 */

/**
 * True for player-character actor types — the per-line `<system>-character`
 * types and the generic `character` fallback — and false for everything else
 * (NPCs, vehicles, starships, loot). Drives the linked-token default in
 * `_preCreate` (#479): characters are actor-linked so a placed token stays a
 * live view of the one canonical Actor, while NPCs stay unlinked so one bestiary
 * entry can place many independent mook tokens.
 *
 * Exported and pure so the gate is unit-testable without booting Foundry — the
 * bug it replaced tested `=== 'acolyte' || === 'character'`, which matched no
 * real per-line type (`acolyte` is not a registered type; `character` is only
 * the generic fallback), so every `dh2-character` / `bc-character` / … fell
 * through and was created unlinked.
 */
export function isCharacterActorType(type: string): boolean {
    return type === 'character' || type.endsWith('-character');
}
