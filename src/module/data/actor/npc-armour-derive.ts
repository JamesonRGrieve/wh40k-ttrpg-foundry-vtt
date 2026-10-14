/**
 * Where an NPC's armour comes from (#611).
 *
 * Worn items set Armour Points, through the same {@link computeArmour} a PC
 * uses — coverage per location, the highest piece per location (no stacking),
 * Machine / Natural Armour (which never stack with each other), armour-bearing
 * cybernetics (cumulative), and Good craftsmanship. The precedence:
 *
 *  1. `worn` — the NPC has equipped armour (an armour item, or an armour-bearing
 *     cybernetic): AP is derived from what is equipped, exactly as for a PC. An
 *     authored stat-block value is set aside, so nothing is counted twice.
 *  2. `statBlock` — nothing is equipped and a stat-block AP was authored
 *     (`armour.authored`): the stat block stands, unchanged.
 *  3. `listed` — nothing equipped, nothing authored: the stat-block convention,
 *     where an NPC wears the armour its inventory lists (a bestiary entry's lean
 *     armour carries no equip state), so every listed armour item counts.
 *
 * The derived value stores the AP portion only (`total − toughnessBonus`): the
 * damage path adds Toughness separately.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { computeArmour, hasWornArmour } from '../../utils/armour-calculator.ts';
import type { NpcArmour } from './npc-armour-edit.ts';

/** Which rule set an NPC's armour this prepare. */
export type NpcArmourSource = 'worn' | 'statBlock' | 'listed';

/** The precedence above, as a pure decision. */
export function npcArmourSource(wearsArmour: boolean, authored: boolean): NpcArmourSource {
    if (wearsArmour) return 'worn';
    return authored ? 'statBlock' : 'listed';
}

/** The derived AP an NPC's armour block takes, or null when its stat block stands. */
export type DerivedNpcArmour = Pick<NpcArmour, 'mode' | 'total'> & { locations: Record<string, number> };

/**
 * Derive an NPC's armour from its items, or return null when its authored stat
 * block applies (see {@link npcArmourSource}).
 */
export function deriveNpcArmour(actor: WH40KBaseActor, authored: boolean): DerivedNpcArmour | null {
    const source = npcArmourSource(hasWornArmour(actor), authored);
    if (source === 'statBlock') return null;
    const derived = computeArmour(actor, { equippedOnly: source === 'worn' });
    const locations: Record<string, number> = {};
    let total = 0;
    for (const [location, loc] of Object.entries(derived)) {
        const ap = Math.max(0, loc.total - loc.toughnessBonus);
        locations[location] = ap;
        total = Math.max(total, ap);
    }
    return { mode: 'locations', total, locations };
}
