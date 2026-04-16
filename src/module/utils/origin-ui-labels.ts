/**
 * Shared UI Label Utilities for Origin Path System
 *
 * Single source of truth for characteristic display info,
 * training labels, and choice type labels used across
 * the origin path builder, detail dialog, choice dialog, and sheets.
 */

import type { BaseSystemConfig } from '../config/game-systems/base-system-config.ts';

/* -------------------------------------------- */
/*  Characteristic Display                      */
/* -------------------------------------------- */

const CHARACTERISTIC_INFO: Record<string, { label: string; short: string }> = {
    weaponSkill: { label: 'Weapon Skill', short: 'WS' },
    ballisticSkill: { label: 'Ballistic Skill', short: 'BS' },
    strength: { label: 'Strength', short: 'S' },
    toughness: { label: 'Toughness', short: 'T' },
    agility: { label: 'Agility', short: 'Ag' },
    intelligence: { label: 'Intelligence', short: 'Int' },
    perception: { label: 'Perception', short: 'Per' },
    willpower: { label: 'Willpower', short: 'WP' },
    fellowship: { label: 'Fellowship', short: 'Fel' },
    influence: { label: 'Influence', short: 'Inf' },
};

/**
 * Get display info for a characteristic key.
 * @param key - Characteristic key (e.g. 'weaponSkill')
 * @returns Label and short abbreviation
 */
export function getCharacteristicDisplayInfo(key: string): { label: string; short: string } {
    return CHARACTERISTIC_INFO[key] ?? { label: key, short: key.substring(0, 3).toUpperCase() };
}

/**
 * Get all characteristic display info.
 */
export function getAllCharacteristicDisplayInfo(): Record<string, { label: string; short: string }> {
    return CHARACTERISTIC_INFO;
}

/* -------------------------------------------- */
/*  Training Labels                             */
/* -------------------------------------------- */

/**
 * Get the display label for a skill training level.
 * Uses the system config's skill ranks for system-appropriate terminology.
 * @param level - Level key from origin data ('trained', 'plus10', 'known', 'experienced', etc.)
 * @param systemConfig - The active system config (optional — falls back to generic labels)
 * @returns Display label (e.g. 'Trained', 'Known', '+10', 'Experienced')
 */
export function getTrainingLabel(level: string, systemConfig?: BaseSystemConfig): string {
    if (systemConfig) {
        const ranks = systemConfig.getSkillRanks();
        const rank = ranks.find((r) => r.key === level);
        if (rank) return rank.tooltip;
    }

    // Generic fallback covering both RT and DH2e terminology
    const GENERIC_LABELS: Record<string, string> = {
        trained: 'Trained',
        plus10: '+10',
        plus20: '+20',
        plus30: '+30',
        known: 'Known',
        experienced: 'Experienced',
        veteran: 'Veteran',
    };
    return GENERIC_LABELS[level] ?? level ?? 'Trained';
}

/* -------------------------------------------- */
/*  Choice Type Labels                          */
/* -------------------------------------------- */

/**
 * Get the display label for a choice type.
 * Uses i18n when available, falls back to capitalized type.
 * @param type - Choice type key ('talent', 'skill', 'characteristic', etc.)
 * @returns Localized label
 */
export function getChoiceTypeLabel(type: string): string {
    const key = `WH40K.ChoiceType.${type}`;
    const localized = game.i18n.localize(key);
    // If localization returned the key itself, fall back to capitalized type
    if (localized === key) {
        return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Choice';
    }
    return localized;
}
