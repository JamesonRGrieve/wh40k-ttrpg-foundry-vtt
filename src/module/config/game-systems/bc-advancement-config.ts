/**
 * @file Black Crusade advancement cost matrix and patron-status helpers.
 *
 * Replaces aptitude-based cost reuse for BC. BC has no aptitudes and no
 * career ranks — its advancement cost is a flat True / Allied / Opposed
 * × tier matrix (the characteristic, skill and talent advance cost tables)
 * over 4 characteristic tiers, 4 skill ranks, and 3 talent tiers.
 * Allies/Opponents are resolved via the Allies and Opponents table.
 *
 * Content-affiliations (which characteristic, skill, or talent counts
 * toward which Dark God for Alignment purposes) live in compendium
 * `_source/*.json` per Direction #7 — this module's
 * `characteristicAffiliation` map only covers the four characteristics
 * the RAW explicitly affiliates (Str/Tou/Fel/WP). All
 * others, and per-talent / per-skill affiliations, are read off the
 * advance's `chaosAlignment` slot at advance time.
 *
 * This module is pure: no Foundry imports, no actor coupling. Consumers
 * are `BCSystemConfig` (cost dispatch) and `bc-alignment-derivation.ts`
 * (alignment tally → current alignment).
 */

import type { I18nKey } from '../../types/i18n-keys';
import type { ChaosAlignment } from './types.ts';

/** Patron Status for a given advance, given the character's current alignment. */
export type PatronStatus = 'true' | 'allied' | 'opposed';

/**
 * Allies and Opponents.
 * Row = character alignment, column = advance alignment.
 *
 * Unaligned row: every advance is Allied (the "Unaligned" character pays
 * the standard cost — the RAW table reads `Allied` across the row).
 * Unaligned column: every advance is Allied for everyone (unaligned
 * advances have no affiliation).
 */
const ALLIES_OPPONENTS: Record<ChaosAlignment, Record<ChaosAlignment, PatronStatus>> = {
    khorne: {
        khorne: 'true',
        nurgle: 'allied',
        slaanesh: 'opposed',
        tzeentch: 'opposed',
        unaligned: 'allied',
    },
    nurgle: {
        khorne: 'allied',
        nurgle: 'true',
        slaanesh: 'opposed',
        tzeentch: 'opposed',
        unaligned: 'allied',
    },
    slaanesh: {
        khorne: 'opposed',
        nurgle: 'opposed',
        slaanesh: 'true',
        tzeentch: 'allied',
        unaligned: 'allied',
    },
    tzeentch: {
        khorne: 'opposed',
        nurgle: 'opposed',
        slaanesh: 'allied',
        tzeentch: 'true',
        unaligned: 'allied',
    },
    unaligned: {
        khorne: 'allied',
        nurgle: 'allied',
        slaanesh: 'allied',
        tzeentch: 'allied',
        unaligned: 'allied',
    },
};

/**
 * Characteristic Advancement Costs.
 * Index = number of advances already purchased on this characteristic
 * (0 = next is Simple, 3 = next is Expert).
 */
const CHAR_COST_TABLE: Record<PatronStatus, readonly number[]> = {
    true: [100, 250, 500, 750],
    allied: [250, 500, 750, 1000],
    opposed: [500, 750, 1000, 2500],
} as const;

/**
 * Skill Advance Costs.
 * Index = current rank (0 = next is Known, 3 = next is Veteran).
 */
const SKILL_COST_TABLE: Record<PatronStatus, readonly number[]> = {
    true: [100, 200, 400, 600],
    allied: [200, 350, 500, 750],
    opposed: [250, 500, 750, 1000],
} as const;

/**
 * Talent Advance Costs.
 * Index = (tier - 1); tiers are 1-based in RAW.
 */
const TALENT_COST_TABLE: Record<PatronStatus, readonly number[]> = {
    true: [200, 300, 400],
    allied: [250, 500, 750],
    opposed: [500, 750, 1000],
} as const;

/** BC tier keys for characteristic advancement (4-tier). */
export const BC_CHARACTERISTIC_TIERS = ['simple', 'intermediate', 'trained', 'expert'] as const;

/** BC skill rank keys (4-rank). */
export const BC_SKILL_RANK_KEYS = ['known', 'trained', 'experienced', 'veteran'] as const;

/**
 * Characteristic affiliation (the RAW affiliation table). Only the four
 * characteristics the RAW pairs to a Dark God are non-null; the other six
 * (WS / BS / Agility / Intelligence / Perception / Infamy) are unaligned.
 */
const CHARACTERISTIC_AFFILIATION: Record<string, ChaosAlignment> = {
    strength: 'khorne',
    toughness: 'nurgle',
    fellowship: 'slaanesh',
    willpower: 'tzeentch',
    weaponSkill: 'unaligned',
    ballisticSkill: 'unaligned',
    agility: 'unaligned',
    intelligence: 'unaligned',
    perception: 'unaligned',
    infamy: 'unaligned',
};

/** Flat Infamy advance cost. +5 per purchase, blocked at >=40. */
export const BC_INFAMY_ADVANCE_COST = 500;
/** Maximum Infamy value at which advance purchase is still legal. */
export const BC_INFAMY_ADVANCE_CAP = 40;
/** Per-advance Infamy increment. */
export const BC_INFAMY_INCREMENT = 5;

/**
 * Threshold delta for triggering an alignment switch: a character switches alignment when one Dark God's advance
 * tally exceeds the next-highest god's tally by this many advances.
 */
export const BC_ALIGNMENT_SWITCH_THRESHOLD = 5;

/**
 * Corruption Point interval at which Alignment is re-evaluated.
 */
export const BC_ALIGNMENT_CHECK_CP_INTERVAL = 10;

/** Resolve the Patron Status of an advance, given the character's alignment. */
export function patronStatusFor(characterAlignment: ChaosAlignment, advanceAlignment: ChaosAlignment): PatronStatus {
    return ALLIES_OPPONENTS[characterAlignment][advanceAlignment];
}

/**
 * Characteristic advance cost for a BC character.
 * @param characterAlignment The character's current Chaos alignment.
 * @param advanceAlignment   The alignment the advance belongs to.
 * @param currentTier        0-based index of next advance (0..3).
 * @returns Cost in xp, or null if no further advance is legal.
 */
export function characteristicAdvanceCost(characterAlignment: ChaosAlignment, advanceAlignment: ChaosAlignment, currentTier: number): number | null {
    if (currentTier < 0 || currentTier >= BC_CHARACTERISTIC_TIERS.length) return null;
    const status = patronStatusFor(characterAlignment, advanceAlignment);
    return CHAR_COST_TABLE[status][currentTier] ?? null;
}

/**
 * Skill advance cost for a BC character.
 * @param characterAlignment The character's current Chaos alignment.
 * @param advanceAlignment   The alignment the skill belongs to.
 * @param currentRank        Current skill rank (0 = untrained / pre-Known).
 * @returns Cost in xp, or null if rank is already Veteran.
 */
export function skillAdvanceCost(characterAlignment: ChaosAlignment, advanceAlignment: ChaosAlignment, currentRank: number): number | null {
    if (currentRank < 0 || currentRank >= BC_SKILL_RANK_KEYS.length) return null;
    const status = patronStatusFor(characterAlignment, advanceAlignment);
    return SKILL_COST_TABLE[status][currentRank] ?? null;
}

/**
 * Talent advance cost for a BC character.
 * @param characterAlignment The character's current Chaos alignment.
 * @param advanceAlignment   The alignment the talent belongs to.
 * @param talentTier         Talent tier in RAW terms (1, 2, or 3).
 * @returns Cost in xp, or null if `talentTier` is not 1..3.
 */
export function talentAdvanceCost(characterAlignment: ChaosAlignment, advanceAlignment: ChaosAlignment, talentTier: number): number | null {
    const idx = talentTier - 1;
    if (idx < 0 || idx >= TALENT_COST_TABLE.true.length) return null;
    const status = patronStatusFor(characterAlignment, advanceAlignment);
    return TALENT_COST_TABLE[status][idx] ?? null;
}

/**
 * Infamy advance cost. Returns null if the character is already at or
 * above the cap.
 *
 * @param currentInfamy The character's current Infamy value.
 */
export function infamyAdvanceCost(currentInfamy: number): number | null {
    if (currentInfamy >= BC_INFAMY_ADVANCE_CAP) return null;
    return BC_INFAMY_ADVANCE_COST;
}

/**
 * Characteristic affiliation lookup. Returns 'unaligned' when the key is
 * unknown (defensive: a content-authoring miss in a future characteristic
 * shouldn't crash). Per Direction #7 the canonical table for characteristic
 * affiliation is the RAW affiliation table; only four entries are
 * non-unaligned.
 */
export function characteristicAffiliation(charKey: string): ChaosAlignment {
    return CHARACTERISTIC_AFFILIATION[charKey] ?? 'unaligned';
}

/**
 * Whether the supplied alignment locks psychic powers.
 * Aligned to Khorne → no psychic powers, lose Psyker Trait counts.
 */
export function alignmentBlocksPsyker(alignment: ChaosAlignment): boolean {
    return alignment === 'khorne';
}

/** Each Chaos alignment's display label (#646): the stored id is lower-case ("khorne"). */
const CHAOS_ALIGNMENT_LABEL_KEYS: Readonly<Record<ChaosAlignment, I18nKey>> = {
    khorne: 'WH40K.BC.Advancement.Alignment.Khorne',
    nurgle: 'WH40K.BC.Advancement.Alignment.Nurgle',
    slaanesh: 'WH40K.BC.Advancement.Alignment.Slaanesh',
    tzeentch: 'WH40K.BC.Advancement.Alignment.Tzeentch',
    unaligned: 'WH40K.BC.Advancement.Alignment.Unaligned',
};

/** Whether a value is one of the Chaos alignment ids. */
export function isChaosAlignment(value: string): value is ChaosAlignment {
    return Object.hasOwn(CHAOS_ALIGNMENT_LABEL_KEYS, value);
}

/**
 * The langpack key of an alignment's display label, for `{{localize (chaosAlignmentLabelKey id)}}`.
 * A value that is not an alignment id comes back unchanged, so it shows rather than vanishing.
 */
export function chaosAlignmentLabelKey(alignment: string): string {
    return isChaosAlignment(alignment) ? alignmentLabelKey(alignment) : alignment;
}

/** The langpack key of a known alignment's display label. */
export function alignmentLabelKey(alignment: ChaosAlignment): I18nKey {
    return CHAOS_ALIGNMENT_LABEL_KEYS[alignment];
}
