/**
 * @gulpfile.js OriginPathSheet - Item sheet for origin path items
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
    /** @foundry-v14-overrides.d.ts */
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

    /** @foundry-v14-overrides.d.ts */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/item/item-origin-path-sheet.hbs',
            scrollable: [''],
        },
    };

    /** @foundry-v14-overrides.d.ts */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get title() {
        return this.document?.name || 'Origin Path';
    }

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        const system = this.document.system as Record<string, unknown>;
        const grants = system?.grants as Record<string, unknown> || {};
        // Ensure modifiers is treated as an object with number values
        const modifiers = (system?.modifiers?.characteristics as Record<string, number>) || {};

        context.origin = this.document;
        context.allowSelection = false;
        context.isSelected = false;

        // Basic info
        context.name = this.document.name;
        context.img = this.document.img;
        context.step = system?.step;
        context.stepLabel = this._getStepLabel(system?.step as any); // Step is potentially unknown, cast for _getStepLabel
        context.xpCost = system?.xpCost || 0;
        context.isAdvanced = system?.isAdvancedOrigin || false;

        // Description
        context.description = system?.description?.value || '';
        context.hasDescription = !!context.description;

        // Source info
        // TS18046: 'context.source' is of type 'unknown'.
        context.source = system?.source as Record<string, unknown> || {};
        // TS18046: 'context.source' is of type 'unknown'. (Usage)
        context.hasSource = !!((context.source as Record<string, unknown>).book || (context.source as Record<string, unknown>).page);

        // Characteristic modifiers
        context.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                context.characteristics.push({
                    key: key,
                    label: getCharacteristicDisplayInfo(key).label,
                    short: getCharacteristicDisplayInfo(key).short,
                    value: value,
                    positive: value > 0,
                });
            }
        }
        context.hasCharacteristics = context.characteristics.length > 0;

        // Wounds/Fate formulas
        // TS2339: Property 'woundsFormula' does not exist on type '{}'.
        // TS2339: Property 'fateFormula' does not exist on type '{}'.
        context.woundsFormula = (grants as Record<string, unknown>).woundsFormula || null;
        context.fateFormula = (grants as Record<string, unknown>).fateFormula || null;
        context.hasFormulas = !!(context.woundsFormula || context.fateFormula);

        // Skills
        // TS2339: Property 'skills' does not exist on type '{}'.
        // TS7006: Parameter 'skill' implicitly has 'any' type.
        context.skills = ((grants as Record<string, unknown>).skills as Record<string, unknown>[] || []).map((skill: Record<string, unknown>) => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || 'trained',
            levelLabel: getTrainingLabel(skill.level as string),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name,
        }));
        context.hasSkills = context.skills.length > 0;

        // Talents
        // TS2339: Property 'talents' does not exist on type '{}'.
        // TS7006: Parameter 'talent' implicitly has 'any' type.
        context.talents = ((grants as Record<string, unknown>).talents as Record<string, unknown>[] || []).map((talent: Record<string, unknown>) => ({
            name: talent.name,
            specialization: talent.specialization || null,
            uuid: talent.uuid || null,
            hasItem: !!talent.uuid,
        }));
        context.hasTalents = context.talents.length > 0;

        // Traits
        // TS2339: Property 'traits' does not exist on type '{}'.
        // TS7006: Parameter 'trait' implicitly has 'any' type.
        context.traits = ((grants as Record<string, unknown>).traits as Record<string, unknown>[] || []).map((trait: Record<string, unknown>) => ({
            name: trait.name,
            level: trait.level || null,
            uuid: trait.uuid || null,
            hasItem: !!trait.uuid,
        }));
        context.hasTraits = context.traits.length > 0;

        // Equipment
        // TS2339: Property 'equipment' does not exist on type '{}'.
        // TS7006: Parameter 'item' implicitly has 'any' type.
        context.equipment = ((grants as Record<string, unknown>).equipment as Record<string, unknown>[] || []).map((item: Record<string, unknown>) => ({
            name: item.name || item,
            quantity: item.quantity || 1,
            uuid: item.uuid || null,
        }));
        context.hasEquipment = context.equipment.length > 0;

        // Special Abilities
        // TS2339: Property 'specialAbilities' does not exist on type '{}'.
        // TS18046: 'context.specialAbilities' is of type 'unknown'. (Usage)
        context.specialAbilities = grants.specialAbilities || [];
        context.hasSpecialAbilities = (context.specialAbilities as unknown[]).length > 0;

        // Choices
        // TS2339: Property 'choices' does not exist on type '{}'.
        // TS7006: Parameter 'choice' implicitly has 'any' type.
        // TS7006: Parameter 'opt' implicitly has 'any' type.
        context.choices = ((grants as Record<string, unknown>).choices as Record<string, unknown>[] || []).map((choice: Record<string, unknown>) => ({
            type: choice.type,
            typeLabel: getChoiceTypeLabel(choice.type as string),
            label: choice.label,
            count: choice.count || 1,
            options: (choice.options as Record<string, unknown>[] || []).map((opt: Record<string, unknown>) => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || '',
            })),
        }));
        // TS18046: 'context.choices' is of type 'unknown'. (Usage)
        context.hasChoices = (context.choices as unknown[]).length > 0;

        // Requirements
        // TS18046: 'context.requirements' is of type 'unknown'.
        context.requirements = system?.requirements as Record<string, unknown> || {};
        // TS18046: 'context.requirements' is of type 'unknown'. (Usage)
        context.hasRequirements = !!((context.requirements as Record<string, unknown>).text || (context.requirements as Record<string, unknown>).previousSteps?.length || (context.requirements as Record<string, unknown>).excludedSteps?.length);

        return context;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    // TS7053: Element implicitly has 'any' type because expression of type 'any' can't be used to index type '{...}'.
    // TS7006: Parameter implicitly has 'any' type.
    _getStepLabel(step: string | undefined | null): string {
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

        // Capitalize first letter for lookup
        const key = step.charAt(0).toUpperCase() + step.slice(1);
        const localizationKey = `WH40K.OriginPath.${key}`;

        // Check if a localized string exists, otherwise use the default label
        // The `step` parameter type is string, so `labels[step]` is safe if `step` is one of the keys.
        // However, `key` is used for localization, and `step` for direct label lookup.
        // The original code used `labels[step]`, so we should ensure `step` is a valid key.
        // Since `step` can be any, we cast it to `keyof typeof labels` for safe indexing.
        return game.i18n.has?.(localizationKey) ? game.i18n.localize(localizationKey) : labels[step as keyof typeof labels] || step;
    }
}
