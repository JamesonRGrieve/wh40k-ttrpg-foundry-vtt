/**
 * An NPC's armour, read per hit location for the shared armour silhouette (#611).
 *
 * The silhouette was written for the PC creature model, which prepares one
 * `{value, total, toughnessBonus, traitBonus}` entry per location. An NPC's
 * armour block is `{mode, total, locations}` and holds the AP portion only, so
 * reading it as the PC shape showed 0 on every location of every NPC. This maps
 * one location onto the silhouette's shape: `value` is the AP there (the flat
 * total in `simple` mode) and `total` adds the Toughness bonus, as a PC's does.
 */

import type { NpcArmour } from '../../data/actor/npc-armour-edit.ts';
import type { WH40KArmourLocation } from '../../types/global.d.ts';

export function npcArmourAtLocation(armour: Pick<NpcArmour, 'mode' | 'total' | 'locations'>, locationKey: string, toughnessBonus: number): WH40KArmourLocation {
    const ap = armour.mode === 'simple' ? armour.total : armour.locations[locationKey] ?? 0;
    return { value: ap, total: ap + toughnessBonus, toughnessBonus, traitBonus: 0 };
}
