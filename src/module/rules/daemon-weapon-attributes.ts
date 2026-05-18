/**
 * Daemon Weapon Attributes (beyond.md L1651-1820).
 *
 * The bound entity grants the wielder a roll-determined set of Attributes;
 * how many are available depends on the weapon's Binding Strength
 * ({@link BINDING_STRENGTH_PROFILES}). Roll 1d10 per Attribute slot:
 *  - one roll is always made on the General table;
 *  - subsequent rolls are made on the table matching the weapon's
 *    daemonic alignment (Khorne / Nurgle / Tzeentch / Slaanesh).
 * Unaligned weapons keep using the General table for every slot.
 *
 * Illustrative entries (six per table) — full table fidelity follows in
 * the compendium import pass. The structure is fixed (id, roll-range,
 * label, mechanical effect summary) so the importer can extend each
 * table to 1d10 coverage without schema churn.
 */

import type { ChaosAlignment } from '../config/game-systems/types.ts';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from './daemon-weapon.ts';

/** A single 1d10 entry on a Daemon Weapon Attribute table. */
export interface DaemonWeaponAttribute {
    /** Stable identifier (kebab-case). */
    id: string;
    /** Inclusive [min, max] 1d10 range that maps to this entry. */
    roll: readonly [number, number];
    /** Display label of the Attribute. */
    label: string;
    /** Mechanical-rider summary (single sentence; expanded in compendium). */
    effect: string;
}

/** Discriminator for the five distinct Attribute tables. */
export type DaemonWeaponAttributeTable = 'general' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';

const GENERAL_TABLE: readonly DaemonWeaponAttribute[] = [
    { id: 'general.bloodthirsty', roll: [1, 2], label: 'Bloodthirsty', effect: 'Wielder must spill blood each scene or take 1 Corruption.' },
    { id: 'general.unholy-vigour', roll: [3, 4], label: 'Unholy Vigour', effect: 'Once per session, ignore the next failed Toughness test.' },
    { id: 'general.warp-tether', roll: [5, 6], label: 'Warp Tether', effect: 'Weapon counts as Warp Weapon on a successful binding test.' },
    { id: 'general.devourer', roll: [7, 8], label: 'Devourer', effect: 'On a kill, regain 1 Wound to a maximum of half starting Wounds.' },
    { id: 'general.whispering-edge', roll: [9, 9], label: 'Whispering Edge', effect: 'Grants +10 to Intimidate while wielded openly.' },
    { id: 'general.brand-of-the-pact', roll: [10, 10], label: 'Brand of the Pact', effect: 'Marks the wielder; Pure psykers detect them at 30m.' },
];

const KHORNE_TABLE: readonly DaemonWeaponAttribute[] = [
    { id: 'khorne.skull-taker', roll: [1, 2], label: 'Skull Taker', effect: 'Confirmed Righteous Fury triggers a free called shot to the head.' },
    { id: 'khorne.crimson-thirst', roll: [3, 4], label: 'Crimson Thirst', effect: '+2 damage on the first hit each combat.' },
    { id: 'khorne.rage-of-the-eight', roll: [5, 6], label: 'Rage of the Eight', effect: 'Once per scene, the wielder may take an extra melee attack as a Free Action.' },
    { id: 'khorne.bloodletter-strike', roll: [7, 8], label: 'Bloodletter Strike', effect: 'Weapon counts as having Razor Sharp.' },
    { id: 'khorne.unstoppable', roll: [9, 9], label: 'Unstoppable', effect: 'Ignore Fatigue inflicted while in melee.' },
    { id: 'khorne.brass-collar', roll: [10, 10], label: 'Brass Collar', effect: 'Daemons within 5m suffer -10 WS.' },
];

const NURGLE_TABLE: readonly DaemonWeaponAttribute[] = [
    { id: 'nurgle.plague-bearer', roll: [1, 2], label: 'Plague Bearer', effect: 'Targets damaged must pass Toughness or contract Nurgle’s Rot.' },
    { id: 'nurgle.unyielding-flesh', roll: [3, 4], label: 'Unyielding Flesh', effect: '+1 Toughness Bonus while wielded.' },
    { id: 'nurgle.weeping-edge', roll: [5, 6], label: 'Weeping Edge', effect: 'Weapon counts as Toxic (1).' },
    { id: 'nurgle.fly-swarm', roll: [7, 8], label: 'Fly Swarm', effect: 'Within 5m, enemies suffer -10 to ranged attacks.' },
    { id: 'nurgle.gift-of-decay', roll: [9, 9], label: 'Gift of Decay', effect: 'Wounded foes lose 1 AP from struck location for the scene.' },
    { id: 'nurgle.papa-nurgles-blessing', roll: [10, 10], label: 'Papa Nurgle’s Blessing', effect: 'Wielder gains immunity to one disease at the GM’s choice.' },
];

const SLAANESH_TABLE: readonly DaemonWeaponAttribute[] = [
    { id: 'slaanesh.exquisite-edge', roll: [1, 2], label: 'Exquisite Edge', effect: 'Critical Damage tables roll twice; choose either result.' },
    { id: 'slaanesh.serpents-grace', roll: [3, 4], label: 'Serpent’s Grace', effect: '+10 to Dodge while wielded.' },
    { id: 'slaanesh.lingering-touch', roll: [5, 6], label: 'Lingering Touch', effect: 'Damaged targets suffer -10 to all tests for one round.' },
    { id: 'slaanesh.song-of-six', roll: [7, 8], label: 'Song of Six', effect: 'Once per session, charm a single non-daemon for one minute (Willpower negates).' },
    { id: 'slaanesh.sense-stealer', roll: [9, 9], label: 'Sense Stealer', effect: 'Wielder may inflict Blinded (1) on a confirmed crit.' },
    { id: 'slaanesh.unending-yearning', roll: [10, 10], label: 'Unending Yearning', effect: 'Each scene without combat costs the wielder 1 Insanity Point.' },
];

const TZEENTCH_TABLE: readonly DaemonWeaponAttribute[] = [
    { id: 'tzeentch.shifting-edge', roll: [1, 2], label: 'Shifting Edge', effect: 'Re-roll the damage die once per combat.' },
    { id: 'tzeentch.warp-eye', roll: [3, 4], label: 'Warp Eye', effect: '+10 to Awareness against psykers and daemons.' },
    { id: 'tzeentch.flickering-form', roll: [5, 6], label: 'Flickering Form', effect: 'Once per scene, count as one Range Band further when shot at.' },
    { id: 'tzeentch.pink-fire', roll: [7, 8], label: 'Pink Fire', effect: 'Weapon counts as Warp Weapon and inflicts Flame on a confirmed crit.' },
    { id: 'tzeentch.twist-of-fate', roll: [9, 9], label: 'Twist of Fate', effect: 'Once per session, force an enemy to re-roll a successful attack against the wielder.' },
    { id: 'tzeentch.changers-gift', roll: [10, 10], label: 'Changer’s Gift', effect: 'Wielder may attempt a single non-mastered psychic power at -20.' },
];

/** Indexed registry of every Attribute table. */
export const DAEMON_WEAPON_ATTRIBUTE_TABLES: Record<DaemonWeaponAttributeTable, readonly DaemonWeaponAttribute[]> = {
    general: GENERAL_TABLE,
    khorne: KHORNE_TABLE,
    nurgle: NURGLE_TABLE,
    slaanesh: SLAANESH_TABLE,
    tzeentch: TZEENTCH_TABLE,
};

/** Map a ChaosAlignment onto the table the second-and-later rolls should hit. */
export function tableForAlignment(alignment: ChaosAlignment): DaemonWeaponAttributeTable {
    if (alignment === 'unaligned') return 'general';
    return alignment;
}

/** Resolve a 1d10 roll value against a table entry. */
export function attributeAtRoll(table: DaemonWeaponAttributeTable, roll: number): DaemonWeaponAttribute {
    const entries = DAEMON_WEAPON_ATTRIBUTE_TABLES[table];
    const clamped = Math.max(1, Math.min(10, Math.floor(roll)));
    const found = entries.find((entry) => clamped >= entry.roll[0] && clamped <= entry.roll[1]);
    // Tables cover 1..10 by construction; fall back defensively to the last entry to keep the signature non-undefined.
    return found ?? entries[entries.length - 1]!;
}

/** Result of a Daemon Weapon Attribute roll session. */
export interface DaemonWeaponAttributeRollResult {
    /** Number of Attribute slots granted by Binding Strength. */
    slots: number;
    /** Resolved Attribute per slot, with the d10 value that selected it. */
    picks: ReadonlyArray<{ slot: number; table: DaemonWeaponAttributeTable; roll: number; attribute: DaemonWeaponAttribute }>;
}

/**
 * Roll Attributes for a Daemon Weapon.
 *
 * @param alignment The weapon's daemonic alignment.
 * @param bindingStrength Drives how many slots are rolled.
 * @param rng Optional injectable RNG; defaults to Math.random for production.
 */
export function rollDaemonWeaponAttributes(
    alignment: ChaosAlignment,
    bindingStrength: BindingStrength,
    rng: () => number = Math.random,
): DaemonWeaponAttributeRollResult {
    const slots = BINDING_STRENGTH_PROFILES[bindingStrength].attributes;
    const alignedTable = tableForAlignment(alignment);
    const picks: Array<{ slot: number; table: DaemonWeaponAttributeTable; roll: number; attribute: DaemonWeaponAttribute }> = [];
    for (let slot = 1; slot <= slots; slot += 1) {
        // First slot always rolls on the General table; subsequent slots roll on the aligned table.
        const table: DaemonWeaponAttributeTable = slot === 1 ? 'general' : alignedTable;
        const roll = Math.floor(rng() * 10) + 1;
        picks.push({ slot, table, roll, attribute: attributeAtRoll(table, roll) });
    }
    return { slots, picks };
}
