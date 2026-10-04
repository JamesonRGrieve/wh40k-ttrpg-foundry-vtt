/**
 * Shared UI Label Utilities for Origin Path System
 *
 * Single source of truth for characteristic display info,
 * training labels, and choice type labels used across
 * the origin path builder, detail dialog, choice dialog, and sheets.
 */

import type { BaseSystemConfig } from '../config/game-systems/base-system-config.ts';
import { capitalize } from './format.ts';

/* -------------------------------------------- */
/*  Characteristic Display                      */
/* -------------------------------------------- */

/**
 * Get display info for a characteristic key, localized from the canonical
 * `WH40K.characteristics` registry (label) and its `WH40K.Characteristic.Abbr.*`
 * langpack entries (short code).
 * @param key - Characteristic key (e.g. 'weaponSkill')
 * @returns Label and short abbreviation
 */
export function getCharacteristicDisplayInfo(key: string): { label: string; short: string } {
    const config = Object.entries(CONFIG.wh40k.characteristics).find(([characteristicKey]) => characteristicKey === key)?.[1];
    if (config === undefined) return { label: key, short: key.substring(0, 3).toUpperCase() };
    return { label: game.i18n.localize(config.label), short: game.i18n.localize(`WH40K.Characteristic.Abbr.${capitalize(key)}`) };
}

/**
 * Get all characteristic display info.
 */
export function getAllCharacteristicDisplayInfo(): Record<string, { label: string; short: string }> {
    return Object.fromEntries(Object.keys(CONFIG.wh40k.characteristics).map((key) => [key, getCharacteristicDisplayInfo(key)]));
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
        const rank = systemConfig.getLocalizedSkillRanks().find((r) => r.key === level);
        if (rank) return rank.tooltip;
    }

    // Generic fallback covering both RT and DH2e terminology (langpack keys).
    const GENERIC_LABEL_KEYS: Record<string, string> = {
        trained: 'WH40K.Skills.Rank.Trained',
        plus10: 'WH40K.Skills.Rank.Plus10',
        plus20: 'WH40K.Skills.Rank.Plus20',
        plus30: 'WH40K.Skills.Rank.Plus30',
        known: 'WH40K.Skills.Rank.Known',
        experienced: 'WH40K.Skills.Rank.Experienced',
        veteran: 'WH40K.Skills.Rank.Veteran',
    };
    const key = GENERIC_LABEL_KEYS[level === '' ? 'trained' : level];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `string`, tsconfig.json (flag on) sees `string | undefined` and requires this guard.
    return key !== undefined ? game.i18n.localize(key) : level;
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
        return type ? capitalize(type) : game.i18n.localize('WH40K.ChoiceType.default');
    }
    return localized;
}
