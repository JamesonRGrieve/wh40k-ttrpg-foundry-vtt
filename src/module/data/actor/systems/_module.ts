/**
 * Per-system actor-level configuration.
 *
 * These classes carry per-system metadata (game-system id, shared fields that
 * apply to every actor kind in that system). Concrete per-kind data models in
 * `concrete/` reference the system config via the `gameSystem` static when
 * doing runtime lookups (skill ranks, origin taxonomy, etc.).
 *
 * Kept deliberately minimal for now — the heavy lifting is in CharacterBaseData
 * / NPCBaseData / VehicleBaseData / StarshipBaseData. System-specific divergent
 * schema fields are added directly on the concrete classes (dh2-character.ts,
 * rt-character.ts, etc.) via defineSchema overrides.
 */

export const GAME_SYSTEMS = {
    dh2: { id: 'dh2e', label: 'Dark Heresy 2e' },
    dh1: { id: 'dh1e', label: 'Dark Heresy 1e' },
    rt: { id: 'rt', label: 'Rogue Trader' },
    bc: { id: 'bc', label: 'Black Crusade' },
    ow: { id: 'ow', label: 'Only War' },
    dw: { id: 'dw', label: 'Deathwatch' },
} as const;

export type GameSystemKey = keyof typeof GAME_SYSTEMS;
