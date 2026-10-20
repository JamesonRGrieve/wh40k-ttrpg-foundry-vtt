/**
 * What a target soaks at one hit location: the armour there (before Penetration)
 * and its Toughness Bonus (#248). PCs and NPCs keep armour in different shapes —
 * a PC's creature model prepares one `{value, toughnessBonus}` entry per location,
 * an NPC's armour is `{mode, total, locations}` (AP only) beside its Toughness — so
 * the damage path, its preview and the card all read them through this one
 * accessor. Reading an NPC as the PC shape matched no location and soaked nothing.
 */

import type { NpcArmour } from '../data/actor/npc-armour-edit.ts';
import type { I18nKey } from '../types/i18n-keys.d.ts';
import { resolveHitLocationId } from './hit-locations.ts';

/**
 * One location of a PC's armour as the creature model prepares it: worn AP
 * (`value`), Best craftsmanship's AP, the cumulative armour-bearing cybernetics,
 * the Machine / Natural Armour trait and Good armour's first-attack AP, beside
 * the Toughness Bonus. The extra parts are absent on armour prepared before they
 * were split out.
 */
interface CreatureArmourLocation {
    readonly value: number;
    readonly toughnessBonus: number;
    readonly craftsmanshipAP?: number;
    readonly cyberneticAP?: number;
    readonly traitBonus?: number;
    readonly goodArmourBonus?: number;
}

/** A PC's armour as the creature model prepares it, by location id. */
type CreatureArmour = Readonly<Partial<Record<string, CreatureArmourLocation>>>;

/** A target's armour, either shape. */
export type TargetArmour = CreatureArmour | NpcArmour;

/** The slice of a target's `system` the soak reads. */
export interface SoakSource {
    readonly armour: TargetArmour;
    /** The target's characteristics; an NPC's Toughness Bonus (Unnatural Toughness folded in) comes from here. */
    readonly characteristics?: { readonly toughness?: { readonly bonus: number } | undefined } | undefined;
}

/** Where a part of a location's armour comes from. */
export type SoakPartKey = 'worn' | 'craftsmanship' | 'cybernetic' | 'trait' | 'good' | 'statBlock';

/** One part of a location's armour, for its provenance row on the card. */
export interface SoakPart {
    readonly key: SoakPartKey;
    readonly value: number;
}

/**
 * What the location soaks: its armour (every part together — Penetration reduces
 * the whole of it, worn and Machine / Natural Armour alike) and, after that, the
 * Toughness Bonus.
 */
export interface LocationSoak {
    readonly armour: number;
    readonly parts: readonly SoakPart[];
    readonly toughnessBonus: number;
}

const SOAK_PART_LABEL_KEYS: Readonly<Record<SoakPartKey, I18nKey>> = {
    worn: 'WH40K.Chat.Damage.Soak.Worn',
    craftsmanship: 'WH40K.Chat.Damage.Soak.Craftsmanship',
    cybernetic: 'WH40K.Chat.Damage.Soak.Cybernetic',
    trait: 'WH40K.Chat.Damage.Soak.Trait',
    good: 'WH40K.Chat.Damage.Soak.Good',
    statBlock: 'WH40K.Chat.Damage.Soak.Armour',
};

/** One row of a hit's soak, as the card's Effective tooltip prints it. */
export interface SoakRow {
    readonly labelKey: I18nKey;
    readonly value: number;
}

/**
 * How a hit's damage was reduced, row by row (#248): the damage, each armour part,
 * cover, Penetration taking back what it can of that armour, and the Toughness
 * Bonus — the sum of the rows is the damage that gets through (before RAW's
 * 1-point minimum on Righteous Fury).
 */
export function soakRows(
    damage: number,
    parts: readonly SoakPart[],
    coverAP: number,
    penetration: number,
    toughnessBonus: number,
    armourIgnored: boolean,
): SoakRow[] {
    const rows: SoakRow[] = [{ labelKey: 'WH40K.Chat.Damage.Soak.Damage', value: damage }];
    if (!armourIgnored) {
        for (const part of parts) rows.push({ labelKey: SOAK_PART_LABEL_KEYS[part.key], value: -part.value });
        if (coverAP !== 0) rows.push({ labelKey: 'WH40K.Chat.Damage.Soak.Cover', value: -coverAP });
        const armour = parts.reduce((sum, part) => sum + part.value, 0) + coverAP;
        const pierced = Math.min(armour, Math.max(0, penetration));
        if (pierced !== 0) rows.push({ labelKey: 'WH40K.Chat.Damage.Soak.Penetration', value: pierced });
    }
    if (toughnessBonus !== 0) rows.push({ labelKey: 'WH40K.Chat.Damage.Soak.Toughness', value: -toughnessBonus });
    return rows;
}

/** The non-zero parts, and their sum. */
function soakOf(parts: readonly SoakPart[], toughnessBonus: number): LocationSoak {
    const present = parts.filter((part) => part.value !== 0);
    return { armour: present.reduce((sum, part) => sum + part.value, 0), parts: present, toughnessBonus };
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
    // An NPC's AP is one number: its stat block's, or the AP derived from what it
    // wears (which already folds in its cybernetics, Machine / Natural Armour and
    // Good armour through the same computeArmour a PC uses).
    if (isNpcArmour(armour)) return soakOf([{ key: 'statBlock', value: npcArmourAP(armour, id) }], source.characteristics?.toughness?.bonus ?? 0);
    const entry = armour[id];
    return soakOf(
        [
            { key: 'worn', value: entry?.value ?? 0 },
            { key: 'craftsmanship', value: entry?.craftsmanshipAP ?? 0 },
            { key: 'cybernetic', value: entry?.cyberneticAP ?? 0 },
            { key: 'trait', value: entry?.traitBonus ?? 0 },
            { key: 'good', value: entry?.goodArmourBonus ?? 0 },
        ],
        entry?.toughnessBonus ?? 0,
    );
}
