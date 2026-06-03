/**
 * NPC type axes (#257). The NPC `type` field used to overload two orthogonal
 * concepts — a RAW magnitude tier and a creature nature. They are now separate
 * `tier` / `nature` schema fields. This module holds the vocabularies and the
 * pure split used by the migration and by tooling that still hands over a single
 * legacy type value. Foundry-free so it is unit-testable.
 */

/** RAW tier values for an NPC (magnitude). */
export const NPC_TIERS = ['troop', 'elite', 'master', 'horde'] as const;
export type NpcTier = (typeof NPC_TIERS)[number];

/** Creature-nature values for an NPC (kind); `none` = ordinary humanoid. */
export const NPC_NATURES = ['none', 'swarm', 'creature', 'daemon', 'xenos'] as const;
export type NpcNature = (typeof NPC_NATURES)[number];

/**
 * Split a legacy overloaded NPC `type` into the two axes it conflated. Tier
 * values map to `tier` (nature `none`); nature values map to `nature` (tier
 * defaults to `troop`); anything unrecognised falls back to the schema defaults.
 */
export function splitNpcType(type: string): { tier: NpcTier; nature: NpcNature } {
    if ((NPC_TIERS as readonly string[]).includes(type)) return { tier: type as NpcTier, nature: 'none' };
    if (type !== 'none' && (NPC_NATURES as readonly string[]).includes(type)) return { tier: 'troop', nature: type as NpcNature };
    return { tier: 'troop', nature: 'none' };
}
