/**
 * What a target soaks at one hit location: the armour there (before Penetration)
 * and its Toughness Bonus (#248). PCs and NPCs keep armour in different shapes —
 * a PC's creature model prepares one `{value, toughnessBonus}` entry per location,
 * an NPC's armour is `{mode, total, locations}` (AP only) beside its Toughness — so
 * the damage path, its preview and the card all read them through this one
 * accessor. Reading an NPC as the PC shape matched no location and soaked nothing.
 */

import type { NpcArmour } from '../data/actor/npc-armour-edit.ts';
import { resolveHitLocationId } from './hit-locations.ts';

/** A PC's armour as the creature model prepares it, by location id. */
type CreatureArmour = Readonly<Partial<Record<string, { readonly value: number; readonly toughnessBonus: number }>>>;

/** A target's armour, either shape. */
export type TargetArmour = CreatureArmour | NpcArmour;

/** The slice of a target's `system` the soak reads. */
export interface SoakSource {
    readonly armour: TargetArmour;
    /** The target's characteristics; an NPC's Toughness Bonus (Unnatural Toughness folded in) comes from here. */
    readonly characteristics?: { readonly toughness?: { readonly bonus: number } | undefined } | undefined;
}

/** What the location soaks. */
export interface LocationSoak {
    readonly armour: number;
    readonly toughnessBonus: number;
}

/** Whether a target's armour is an NPC's `{mode, total, locations}` block. */
function isNpcArmour(armour: TargetArmour): armour is NpcArmour {
    return (armour.mode === 'simple' || armour.mode === 'locations') && 'locations' in armour;
}

/**
 * The AP an NPC wears at one hit location: the flat total in `simple` mode, the
 * location's own value in `locations` mode (#611). Shared by the armour silhouette.
 */
export function npcArmourAP(armour: Pick<NpcArmour, 'mode' | 'total' | 'locations'>, locationKey: string): number {
    return armour.mode === 'simple' ? armour.total : armour.locations[locationKey] ?? 0;
}

/**
 * The armour and Toughness Bonus a target soaks a hit with at `location` (a
 * location id, or a legacy display name such as "Right Arm").
 */
export function locationSoak(source: SoakSource, location: string): LocationSoak {
    const id = resolveHitLocationId(location) ?? location;
    const armour = source.armour;
    if (isNpcArmour(armour)) return { armour: npcArmourAP(armour, id), toughnessBonus: source.characteristics?.toughness?.bonus ?? 0 };
    const entry = armour[id];
    return { armour: entry?.value ?? 0, toughnessBonus: entry?.toughnessBonus ?? 0 };
}
