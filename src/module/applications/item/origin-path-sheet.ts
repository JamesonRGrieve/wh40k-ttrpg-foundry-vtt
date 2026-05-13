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
    static override DEFAULT_OPTIONS = {
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
    static override PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/item/item-origin-path-sheet.hbs',
            scrollable: [''],
        },
    };

    /** @override */
    override tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @override */
    override get title(): string {
        return this.document.name || 'Origin Path';
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax, complexity -- boundary: ApplicationV2 _prepareContext options/return are framework-defined free-form payloads; complexity is inherent to context assembly
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        interface OriginGrants {
            woundsFormula?: string;
            fateFormula?: string;
            skills?: Array<{ name: string; specialization?: string; level?: string }>;
            talents?: Array<{ name: string; specialization?: string; uuid?: string }>;
            traits?: Array<{ name: string; level?: string; uuid?: string }>;
            equipment?: Array<{ name?: string; quantity?: number; uuid?: string } | string>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: specialAbilities content shape varies and is rendered raw by the template
            specialAbilities?: unknown[];
            choices?: Array<{ type: string; label: string; count?: number; options: Array<{ label: string; value: string; description?: string }> }>;
        }
        interface OriginSystem {
            grants?: OriginGrants;
            modifiers?: { characteristics?: Record<string, number> };
            step?: string;
            description?: { value?: string };
            source?: { book?: string; page?: string };
            // eslint-disable-next-line no-restricted-syntax -- boundary: requirements step lists hold arbitrary identifier shapes
            requirements?: { text?: string; previousSteps?: unknown[]; excludedSteps?: unknown[] };
            xpCost?: number;
            isAdvancedOrigin?: boolean;
        }
        const system = this.document.system as OriginSystem;
        const grants = system.grants ?? {};
        const modifiers = system.modifiers?.characteristics ?? {};

        const step = system.step;
        const descriptionObj = system.description;
        const sourceObj = system.source ?? {};
        const requirementsObj = system.requirements ?? {};

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
            displayName: skill.specialization !== undefined && skill.specialization.length > 0 ? `${skill.name} (${skill.specialization})` : skill.name,
        }));

        // Talents
        const talents = (grants.talents ?? []).map((talent) => ({
            name: talent.name,
            specialization: talent.specialization ?? null,
            uuid: talent.uuid ?? null,
            hasItem: talent.uuid !== undefined && talent.uuid.length > 0,
        }));

        // Traits
        const traits = (grants.traits ?? []).map((trait) => ({
            name: trait.name,
            level: trait.level ?? null,
            uuid: trait.uuid ?? null,
            hasItem: trait.uuid !== undefined && trait.uuid.length > 0,
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
            xpCost: system.xpCost ?? 0,
            isAdvanced: system.isAdvancedOrigin ?? false,
            description: descriptionObj?.value ?? '',
            hasDescription: descriptionObj?.value !== undefined && descriptionObj.value.length > 0,
            source: sourceObj,
            hasSource: (sourceObj.book !== undefined && sourceObj.book.length > 0) || (sourceObj.page !== undefined && sourceObj.page.length > 0),
            characteristics,
            hasCharacteristics: characteristics.length > 0,
            woundsFormula,
            fateFormula,
            hasFormulas: (woundsFormula !== null && woundsFormula.length > 0) || (fateFormula !== null && fateFormula.length > 0),
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
            hasRequirements:
                (requirementsObj.text !== undefined && requirementsObj.text.length > 0) ||
                (requirementsObj.previousSteps?.length ?? 0) > 0 ||
                (requirementsObj.excludedSteps?.length ?? 0) > 0,
        });

        return context;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    _getStepLabel(step: string | undefined): string {
        if (step === undefined || step.length === 0) return '';
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
        return game.i18n.has(localizationKey) ? game.i18n.localize(localizationKey) : labels[step] ?? step;
    }
}
