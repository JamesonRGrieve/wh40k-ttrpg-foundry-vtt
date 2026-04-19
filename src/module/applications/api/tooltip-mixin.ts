/**
 * @file TooltipMixin - Adds rich tooltip data preparation helpers to ApplicationV2 sheets
 * Works with TooltipsWH40K system for rich tooltip display
 */

import {
    prepareCharacteristicTooltipData,
    prepareSkillTooltipData,
    prepareArmorTooltipData,
    prepareWeaponTooltipData,
    prepareModifierTooltipData,
    prepareQualityTooltipData,
} from '../components/wh40k-tooltip.ts';

/**
 * Mixin to add rich tooltip data preparation helpers to sheets.
 * The actual tooltip display is handled by the global TooltipsWH40K instance.
 * @param {typeof ApplicationV2} Base  The base class being mixed.
 * @returns {typeof TooltipSheet}
 * @mixin
 */
export default function TooltipMixin<T extends new (...args: any[]) => any>(Base: T) {
    return class TooltipSheet extends Base {
        /* -------------------------------------------- */
        /*  Tooltip Data Preparation Helpers            */
        /* -------------------------------------------- */

        /**
         * Prepare characteristic tooltip data.
         * @param {string} key              Characteristic key.
         * @param {object} characteristic   Characteristic data.
         * @param {object} [modifierSources]  Modifier sources.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareCharacteristicTooltip(key: string, characteristic: Record<string, unknown>, modifierSources: Record<string, unknown> = {}): string {
            return prepareCharacteristicTooltipData(key, characteristic, modifierSources);
        }

        /* -------------------------------------------- */

        /**
         * Prepare skill tooltip data.
         * @param {string} key            Skill key.
         * @param {object} skill          Skill data.
         * @param {object} characteristics  Character characteristics.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareSkillTooltip(key: string, skill: Record<string, unknown>, characteristics: Record<string, unknown>): string {
            const actorUuid = this.document?.uuid || null;
            return prepareSkillTooltipData(key, skill, characteristics, actorUuid);
        }

        /* -------------------------------------------- */

        /**
         * Prepare armor tooltip data.
         * @param {string} location     Armor location.
         * @param {object} armorData    Armor data for this location.
         * @param {Array} [equipped]    Equipped armor pieces.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareArmorTooltip(location: string, armorData: Record<string, unknown>, equipped: unknown[] = []): string {
            return prepareArmorTooltipData(location, armorData, equipped);
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon tooltip data.
         * @param {object} weapon  Weapon item.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareWeaponTooltip(weapon: Record<string, unknown>): string {
            return prepareWeaponTooltipData(weapon);
        }

        /* -------------------------------------------- */

        /**
         * Prepare modifier sources tooltip data.
         * @param {string} title    Tooltip title.
         * @param {Array} sources   Modifier sources.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareModifierTooltip(title: string, sources: unknown[]): string {
            return prepareModifierTooltipData(title, sources);
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon quality tooltip data.
         * @param {string} identifier  Quality identifier (e.g., "tearing", "blast-5").
         * @param {number} [level]     Optional quality level.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareQualityTooltip(identifier: string, level: number | null = null): string {
            return prepareQualityTooltipData(identifier, level);
        }
    };
}
