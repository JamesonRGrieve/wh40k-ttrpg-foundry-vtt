/**
 * @file OriginPathSheet - Item sheet for origin path items
 * Extends BaseItemSheet for proper V13 ApplicationV2 integration
 */

import { getCharacteristicDisplayInfo, getTrainingLabel, getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';
import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for origin path items
 * @extends BaseItemSheet
 */
// @ts-expect-error - TS2417 static side inheritance
export default class OriginPathSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'origin-path-sheet'],
        position: {
            width: 700,
            height: 600,
        },
        window: {
            resizable: true,
            icon: 'fa-solid fa-route',
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/item/item-origin-path-sheet.hbs',
            scrollable: [''],
        },
    };

    /** @override */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return this.document?.name || 'Origin Path';
    }

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        const system = this.document.system as Record<string, unknown>;
        interface OriginGrants {
            woundsFormula?: string;
            fateFormula?: string;
            skills?: Array<{ name: string; specialization?: string; level?: string }>;
            talents?: Array<{ name: string; specialization?: string; uuid?: string }>;
            traits?: Array<{ name: string; level?: string; uuid?: string }>;
            equipment?: Array<{ name?: string; quantity?: number; uuid?: string } | string>;
            specialAbilities?: unknown[];
            choices?: Array<{ type: string; label: string; count?: number; options: Array<{ label: string; value: string; description?: string }> }>;
        }
        const grants = (system?.grants ?? {}) as OriginGrants;
        const charModifiers = system?.modifiers as Record<string, unknown> | undefined;
        const modifiers = (charModifiers?.characteristics ?? {}) as Record<string, number>;

        const step = system?.step as string | undefined;
        const descriptionObj = system?.description as Record<string, unknown> | undefined;
        const sourceObj = (system?.source as Record<string, unknown> | undefined) ?? {};
        const requirementsObj = (system?.requirements as Record<string, unknown> | undefined) ?? {};

        // Characteristic modifiers
        const characteristics: Array<{ key: string; label: string; short: string; value: number; positive: boolean }> = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                characteristics.push({
                    key,
                    label: getCharacteristicDisplayInfo(key).label,
                    short: getCharacteristicDisplayInfo(key).short,
                    value,
                    positive: value > 0,
                });
            }
        }

        // Skills
        const skills = (grants.skills ?? []).map((skill) => ({
            name: skill.name,
            specialization: skill.specialization ?? null,
            level: skill.level ?? 'trained',
            levelLabel: getTrainingLabel(skill.level ?? 'trained'),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name,
        }));

        // Talents
        const talents = (grants.talents ?? []).map((talent) => ({
            name: talent.name,
            specialization: talent.specialization ?? null,
            uuid: talent.uuid ?? null,
            hasItem: !!talent.uuid,
        }));

        // Traits
        const traits = (grants.traits ?? []).map((trait) => ({
            name: trait.name,
            level: trait.level ?? null,
            uuid: trait.uuid ?? null,
            hasItem: !!trait.uuid,
        }));

        // Equipment
        const equipment = (grants.equipment ?? []).map((item) => {
            if (typeof item === 'string') return { name: item, quantity: 1, uuid: null };
            return { name: item.name ?? '', quantity: item.quantity ?? 1, uuid: item.uuid ?? null };
        });

        // Choices
        const choices = (grants.choices ?? []).map((choice) => ({
            type: choice.type,
            typeLabel: getChoiceTypeLabel(choice.type),
            label: choice.label,
            count: choice.count ?? 1,
            options: choice.options.map((opt) => ({
                label: opt.label,
                value: opt.value,
                description: opt.description ?? '',
            })),
        }));

        const specialAbilities = grants.specialAbilities ?? [];
        const woundsFormula = grants.woundsFormula ?? null;
        const fateFormula = grants.fateFormula ?? null;

        Object.assign(context, {
            origin: this.document,
            allowSelection: false,
            isSelected: false,
            name: this.document.name,
            img: this.document.img,
            step,
            stepLabel: this._getStepLabel(step),
            xpCost: (system?.xpCost as number) || 0,
            isAdvanced: (system?.isAdvancedOrigin as boolean) || false,
            description: (descriptionObj?.value as string) || '',
            hasDescription: !!descriptionObj?.value,
            source: sourceObj,
            hasSource: !!(sourceObj.book || sourceObj.page),
            characteristics,
            hasCharacteristics: characteristics.length > 0,
            woundsFormula,
            fateFormula,
            hasFormulas: !!(woundsFormula || fateFormula),
            skills,
            hasSkills: skills.length > 0,
            talents,
            hasTalents: talents.length > 0,
            traits,
            hasTraits: traits.length > 0,
            equipment,
            hasEquipment: equipment.length > 0,
            specialAbilities,
            hasSpecialAbilities: specialAbilities.length > 0,
            choices,
            hasChoices: choices.length > 0,
            requirements: requirementsObj,
            hasRequirements: !!(
                requirementsObj.text ||
                (requirementsObj.previousSteps as unknown[] | undefined)?.length ||
                (requirementsObj.excludedSteps as unknown[] | undefined)?.length
            ),
        });

        return context;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    _getStepLabel(step: string | undefined): string {
        if (!step) return '';
        const labels: Record<string, string> = {
            homeWorld: 'Home World',
            birthright: 'Birthright',
            lureOfTheVoid: 'Lure of the Void',
            trialsAndTravails: 'Trials and Travails',
            motivation: 'Motivation',
            career: 'Career',
            lineage: 'Lineage',
            eliteAdvance: 'Elite Advance',
        };
        const key = step.charAt(0).toUpperCase() + step.slice(1);
        const localizationKey = `WH40K.OriginPath.${key}`;
        return game.i18n.has?.(localizationKey) ? game.i18n.localize(localizationKey) : labels[step] ?? step;
    }
}
