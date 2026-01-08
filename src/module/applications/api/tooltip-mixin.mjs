/**
 * @file TooltipMixin - Adds rich tooltip support to ApplicationV2 sheets
 */

import { RTTooltip } from "../components/rt-tooltip.mjs";

/**
 * Mixin to add rich tooltip support to sheets.
 * @param {typeof ApplicationV2} Base  The base class being mixed.
 * @returns {typeof TooltipSheet}
 * @mixin
 */
export default function TooltipMixin(Base) {
    return class TooltipSheet extends Base {
        /** @inheritDoc */
        async _onRender(context, options) {
            await super._onRender(context, options);

            // Initialize tooltips on this sheet
            RTTooltip.initialize(this.element);
        }

        /* -------------------------------------------- */
        /*  Tooltip Data Preparation Helpers            */
        /* -------------------------------------------- */

        /**
         * Prepare characteristic tooltip data.
         * @param {string} key           Characteristic key.
         * @param {object} characteristic  Characteristic data.
         * @param {object} [modifierSources]  Modifier sources.
         * @returns {string}  JSON string for data attribute.
         */
        prepareCharacteristicTooltip(key, characteristic, modifierSources = {}) {
            const sources = modifierSources[key] || [];

            const data = {
                name: key,
                label: characteristic.label,
                base: characteristic.base || 0,
                advance: characteristic.advance || 0,
                modifier: characteristic.modifier || 0,
                unnatural: characteristic.unnatural || 1,
                total: characteristic.total || 0,
                bonus: characteristic.bonus || 0,
                sources: sources.map(s => ({
                    name: s.name || s.source || "Unknown",
                    value: s.value || s.modifier || 0
                }))
            };

            // Return JSON string wrapped in Handlebars.SafeString to prevent double-escaping
            return new Handlebars.SafeString(JSON.stringify(data));
        }

        /* -------------------------------------------- */

        /**
         * Prepare skill tooltip data.
         * @param {string} key      Skill key.
         * @param {object} skill    Skill data.
         * @param {object} characteristics  Character characteristics.
         * @returns {Handlebars.SafeString}  JSON string for data attribute.
         */
        prepareSkillTooltip(key, skill, characteristics) {
            const charKey = skill.characteristic || skill.char || "strength";
            const char = characteristics[charKey] || {};

            const data = {
                name: key,
                label: skill.label || skill.name || key,
                characteristic: char.label || charKey,
                charValue: char.total || 0,
                trained: skill.trained || false,
                plus10: skill.plus10 || false,
                plus20: skill.plus20 || false,
                current: skill.current || 0,
                basic: skill.basic || false
            };

            // Return JSON string wrapped in Handlebars.SafeString to prevent double-escaping
            return new Handlebars.SafeString(JSON.stringify(data));
        }

        /* -------------------------------------------- */

        /**
         * Prepare armor tooltip data.
         * @param {string} location     Armor location.
         * @param {object} armorData    Armor data for this location.
         * @param {Array} [equipped]    Equipped armor pieces.
         * @returns {Handlebars.SafeString}  JSON string for data attribute.
         */
        prepareArmorTooltip(location, armorData, equipped = []) {
            const data = {
                location: this._formatLocation(location),
                total: armorData.total || 0,
                toughnessBonus: armorData.toughnessBonus || 0,
                traitBonus: armorData.traitBonus || 0,
                armorValue: armorData.value || 0,
                equipped: equipped.map(item => ({
                    name: item.name,
                    img: item.img,
                    ap: item.system?.armour?.[location] || 0
                }))
            };

            // Return JSON string wrapped in Handlebars.SafeString to prevent double-escaping
            return new Handlebars.SafeString(JSON.stringify(data));
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon tooltip data.
         * @param {object} weapon  Weapon item.
         * @returns {Handlebars.SafeString}  JSON string for data attribute.
         */
        prepareWeaponTooltip(weapon) {
            const data = {
                name: weapon.name,
                damage: weapon.system?.damage || "—",
                penetration: weapon.system?.penetration || 0,
                range: weapon.system?.range || "—",
                rof: weapon.system?.rof || "—",
                qualities: weapon.system?.qualities?.map(q => q.name || q) || []
            };

            // Return JSON string wrapped in Handlebars.SafeString to prevent double-escaping
            return new Handlebars.SafeString(JSON.stringify(data));
        }

        /* -------------------------------------------- */

        /**
         * Prepare modifier sources tooltip data.
         * @param {string} title    Tooltip title.
         * @param {Array} sources   Modifier sources.
         * @returns {Handlebars.SafeString}  JSON string for data attribute.
         */
        prepareModifierTooltip(title, sources) {
            const data = {
                title,
                sources: sources.map(s => ({
                    name: s.name || s.source || "Unknown",
                    value: s.value || s.modifier || 0
                }))
            };

            // Return JSON string wrapped in Handlebars.SafeString to prevent double-escaping
            return new Handlebars.SafeString(JSON.stringify(data));
        }

        /* -------------------------------------------- */
        /*  Helper Methods                              */
        /* -------------------------------------------- */

        /**
         * Format location name for display.
         * @param {string} location  Location key.
         * @returns {string}  Formatted location.
         * @private
         */
        _formatLocation(location) {
            const locations = {
                head: "Head",
                rightArm: "Right Arm",
                leftArm: "Left Arm",
                body: "Body",
                rightLeg: "Right Leg",
                leftLeg: "Left Leg"
            };

            return locations[location] || location;
        }
    };
}
