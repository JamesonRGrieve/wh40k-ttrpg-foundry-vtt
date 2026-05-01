/**
 * @file TooltipMixin - Adds rich tooltip data preparation helpers to ApplicationV2 sheets
 * Works with TooltipsWH40K system for rich tooltip display
 */

import type { ApplicationV2Ctor } from './application-types.ts';
import {
    prepareCharacteristicTooltipData,
    prepareSkillTooltipData,
    prepareArmorTooltipData,
    prepareWeaponTooltipData,
    prepareModifierTooltipData,
    prepareQualityTooltipData,
} from '../components/wh40k-tooltip.ts';
import type { WH40KArmourLocation, WH40KCharacteristic, WH40KSkill } from '../../types/global.d.ts';
import type { WH40KItem } from '../../documents/item.ts';

/**
 * Mixin to add rich tooltip data preparation helpers to sheets.
 * The actual tooltip display is handled by the global TooltipsWH40K instance.
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed.
 * @returns {any}
 * @mixin
 */
export default function TooltipMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class TooltipSheet extends Base {
        constructor(...args: any[]) {
            super(...args);
        }

        declare document: { uuid?: string } | null;

        /* -------------------------------------------- */
        /*  Tooltip Data Preparation Helpers            */
        /* -------------------------------------------- */

        /**
         * Prepare characteristic tooltip data.
         * @param {string} key              Characteristic key.
         * @param {Record<string, unknown>} characteristic   Characteristic data.
         * @param {Record<string, unknown>} [modifierSources]  Modifier sources.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareCharacteristicTooltip(
            key: string,
            characteristic: WH40KCharacteristic,
            modifierSources: Record<string, import('../../types/global.d.ts').WH40KModifierEntry[]> = {},
        ): string {
            return prepareCharacteristicTooltipData(key, characteristic, modifierSources);
        }

        /* -------------------------------------------- */

        /**
         * Prepare skill tooltip data.
         * @param {string} key            Skill key.
         * @param {Record<string, unknown>} skill          Skill data.
         * @param {Record<string, unknown>} characteristics  Character characteristics.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareSkillTooltip(key: string, skill: WH40KSkill, characteristics: Record<string, WH40KCharacteristic>): string {
            const actorUuid = this.document?.uuid ?? undefined;
            return prepareSkillTooltipData(key, skill, characteristics, actorUuid);
        }

        /* -------------------------------------------- */

        /**
         * Prepare armor tooltip data.
         * @param {string} location     Armor location.
         * @param {Record<string, unknown>} armorData    Armor data for this location.
         * @param {unknown[]} [equipped]    Equipped armor pieces.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareArmorTooltip(location: string, armorData: WH40KArmourLocation, equipped: WH40KItem[] = []): string {
            return prepareArmorTooltipData(location, armorData, equipped);
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon tooltip data.
         * @param {Record<string, unknown>} weapon  Weapon item.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareWeaponTooltip(weapon: WH40KItem): string {
            return prepareWeaponTooltipData(weapon);
        }

        /* -------------------------------------------- */

        /**
         * Prepare modifier sources tooltip data.
         * @param {string} title    Tooltip title.
         * @param {unknown[]} sources   Modifier sources.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareModifierTooltip(title: string, sources: unknown[]): string {
            return prepareModifierTooltipData(title, sources);
        }

        /* -------------------------------------------- */

        /**
         * Prepare weapon quality tooltip data.
         * @param {string} identifier  Quality identifier (e.g., "tearing", "blast-5").
         * @param {number|null} [level]     Optional quality level.
         * @returns {string}  JSON string for data-wh40k-tooltip-data attribute.
         */
        prepareQualityTooltip(identifier: string, level: number | null = null): string {
            return prepareQualityTooltipData(identifier, level);
        }
    };
}
