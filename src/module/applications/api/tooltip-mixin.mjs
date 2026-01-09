/**
 * @file TooltipMixin - Adds rich tooltip data preparation helpers to ApplicationV2 sheets
 * Works with TooltipsRT system for rich tooltip display
 */

import { 
    prepareCharacteristicTooltipData, 
    prepareSkillTooltipData,
    prepareArmorTooltipData,
    prepareWeaponTooltipData,
    prepareModifierTooltipData
} from "../components/rt-tooltip.mjs";

/**
 * Mixin to add rich tooltip data preparation helpers to sheets.
 * The actual tooltip display is handled by the global TooltipsRT instance.
 * @param {typeof ApplicationV2} Base  The base class being mixed.
 * @returns {typeof TooltipSheet}
 * @mixin
 */
export default function TooltipMixin(Base) {
    return class TooltipSheet extends Base {
        /* -------------------------------------------- */
        /*  Tooltip Data Preparation Helpers            */
        /* -------------------------------------------- */

        /**
         * Prepare characteristic tooltip data.
         * @param {string} key              Characteristic key.
         * @param {object} characteristic   Characteristic data.
         * @param {object} [modifierSources]  Modifier sources.
         * @returns {string}  JSON string for data-rt-tooltip-data attribute.
         */
        prepareCharacteristicTooltip(key, characteristic, modifierSources = {}) {
            return prepareCharacteristicTooltipData(key, characteristic, modifierSources);
        }

        /* -------------------------------------------- */

        /**
         * Prepare skill tooltip data.
         * @param {string} key            Skill key.
         * @param {object} skill          Skill data.
         * @param {object} characteristics  Character characteristics.
         * @returns {string}  JSON string for data-rt-tooltip-data attribute.
         */
        prepareSkillTooltip(key, skill, characteristics) {
            return prepareSkillTooltipData(key, skill, characteristics);
        }

        /* -------------------------------------------- */

        /**
         * Prepare armor tooltip data.
         * @param {string} location     Armor location.
         * @param {object} armorData    Armor data for this location.
         * @param {Array} [equipped]    Equipped armor pieces.
         * @returns {string}  JSON string for data-rt-tooltip-data attribute.
         */
        prepareArmorTooltip(location, armorData, equipped = []) {
            return prepareArmorTooltipData(location, armorData, equipped);
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon tooltip data.
         * @param {object} weapon  Weapon item.
         * @returns {string}  JSON string for data-rt-tooltip-data attribute.
         */
        prepareWeaponTooltip(weapon) {
            return prepareWeaponTooltipData(weapon);
        }

        /* -------------------------------------------- */

        /**
         * Prepare modifier sources tooltip data.
         * @param {string} title    Tooltip title.
         * @param {Array} sources   Modifier sources.
         * @returns {string}  JSON string for data-rt-tooltip-data attribute.
         */
        prepareModifierTooltip(title, sources) {
            return prepareModifierTooltipData(title, sources);
        }
    };
}
