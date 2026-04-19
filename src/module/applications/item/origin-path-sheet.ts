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

        const system = this.document.system;
        const grants = system?.grants || {};
        const modifiers = system?.modifiers?.characteristics || {};

        context.origin = this.document;
        context.allowSelection = false;
        context.isSelected = false;

        // Basic info
        context.name = this.document.name;
        context.img = this.document.img;
        context.step = system?.step;
        context.stepLabel = this._getStepLabel(system?.step);
        context.xpCost = system?.xpCost || 0;
        context.isAdvanced = system?.isAdvancedOrigin || false;

        // Description
        context.description = system?.description?.value || '';
        context.hasDescription = !!context.description;

        // Source info
        context.source = system?.source || {};
        // @ts-expect-error - dynamic property access
        context.hasSource = !!(context.source.book || context.source.page);

        // Characteristic modifiers
        context.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                // @ts-expect-error - dynamic property access
                context.characteristics.push({
                    key: key,
                    label: getCharacteristicDisplayInfo(key).label,
                    short: getCharacteristicDisplayInfo(key).short,
                    value: value,
                    // @ts-expect-error - operator type
                    positive: value > 0,
                });
            }
        }
        // @ts-expect-error - dynamic property access
        context.hasCharacteristics = context.characteristics.length > 0;

        // Wounds/Fate formulas
        context.woundsFormula = grants.woundsFormula || null;
        context.fateFormula = grants.fateFormula || null;
        context.hasFormulas = !!(context.woundsFormula || context.fateFormula);

        // Skills
        context.skills = (grants.skills || []).map((skill) => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || 'trained',
            levelLabel: getTrainingLabel(skill.level),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name,
        }));
        // @ts-expect-error - dynamic property access
        context.hasSkills = context.skills.length > 0;

        // Talents
        context.talents = (grants.talents || []).map((talent) => ({
            name: talent.name,
            specialization: talent.specialization || null,
            uuid: talent.uuid || null,
            hasItem: !!talent.uuid,
        }));
        // @ts-expect-error - dynamic property access
        context.hasTalents = context.talents.length > 0;

        // Traits
        context.traits = (grants.traits || []).map((trait) => ({
            name: trait.name,
            level: trait.level || null,
            uuid: trait.uuid || null,
            hasItem: !!trait.uuid,
        }));
        // @ts-expect-error - dynamic property access
        context.hasTraits = context.traits.length > 0;

        // Equipment
        context.equipment = (grants.equipment || []).map((item) => ({
            name: item.name || item,
            quantity: item.quantity || 1,
            uuid: item.uuid || null,
        }));
        // @ts-expect-error - dynamic property access
        context.hasEquipment = context.equipment.length > 0;

        // Special Abilities
        context.specialAbilities = grants.specialAbilities || [];
        // @ts-expect-error - dynamic property access
        context.hasSpecialAbilities = context.specialAbilities.length > 0;

        // Choices
        context.choices = (grants.choices || []).map((choice) => ({
            type: choice.type,
            typeLabel: getChoiceTypeLabel(choice.type),
            label: choice.label,
            count: choice.count || 1,
            options: choice.options.map((opt) => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || '',
            })),
        }));
        // @ts-expect-error - dynamic property access
        context.hasChoices = context.choices.length > 0;

        // Requirements
        context.requirements = system?.requirements || {};
        // @ts-expect-error - dynamic property access
        context.hasRequirements = !!(context.requirements.text || context.requirements.previousSteps?.length || context.requirements.excludedSteps?.length);

        return context;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    _getStepLabel(step: any): string {
        if (!step) return '';
        const labels = {
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
        return game.i18n.has?.(localizationKey) ? game.i18n.localize(localizationKey) : labels[step] || step;
    }
}
