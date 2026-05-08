/**
 * Origin Detail Dialog
 *
 * Full-screen dialog showing complete details for an origin path choice,
 * with a confirm button to select it.
 */

import type { WH40KItem } from '../../documents/item.ts';
import { getCharacteristicDisplayInfo, getTrainingLabel, getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginDetailDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'origin-detail-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.OriginPath.ViewDetails',
            icon: 'fa-solid fa-scroll',
            minimizable: false,
            resizable: true,
        },
        tabs: [
            {
                navSelector: '.origin-detail-tabs',
                contentSelector: '.origin-detail-tab-content',
                initial: 'grants',
            },
        ],
        position: {
            width: 700,
            height: 600,
        },
        actions: {
            confirm: OriginDetailDialog.#confirm,
            cancel: OriginDetailDialog.#cancel,
            openItem: OriginDetailDialog.#openItem,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/character-creation/origin-detail-dialog.hbs',
            scrollable: ['.origin-detail-tab-content'],
        },
    };

    /**
     * The origin path item
     * @type {WH40KItem}
     */
    origin: WH40KItem;

    /**
     * Whether selection is allowed
     * @type {boolean}
     */
    allowSelection: boolean;

    /**
     * Whether this origin is already selected
     * @type {boolean}
     */
    isSelected: boolean;

    /**
     * Promise resolver for awaiting user input
     * @type {((value: { selected: boolean, origin: WH40KItem | null }) => void) | null}
     * @private
     */
    _resolvePromise: ((value: { selected: boolean; origin: WH40KItem | null }) => void) | null = null;

    /* -------------------------------------------- */

    /**
     * @param {WH40KItem} origin - The origin path item to display
     * @param {Object} [options={}] - Additional options
     * @param {boolean} [options.allowSelection=true] - Whether to show the confirm button
     * @param {boolean} [options.isSelected=false] - Whether this origin is already selected
     */
    constructor(origin: WH40KItem, options: Record<string, unknown> = {}) {
        super(options);

        this.origin = origin;
        this.allowSelection = options.allowSelection !== false;
        this.isSelected = options.isSelected === true;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return this.origin.name;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const system = this.origin.system as Record<string, unknown>;
        const grants = (system.grants as Record<string, unknown> | undefined) ?? {};
        const modifiers = ((system.modifiers as Record<string, unknown> | undefined)?.characteristics as Record<string, number> | undefined) ?? {};

        context.origin = this.origin;
        context.allowSelection = this.allowSelection;
        context.isSelected = this.isSelected;

        // Basic info
        context.name = this.origin.name;
        context.img = this.origin.img;
        context.step = system.step;
        context.stepLabel = this._getStepLabel((system.step as string | undefined) ?? '');
        context.xpCost = system.xpCost ?? 0;
        context.isAdvanced = system.isAdvancedOrigin ?? false;

        // Description - parse HTML properly
        context.description = (system.description as Record<string, unknown> | undefined)?.value ?? '';
        context.hasDescription = (context.description as string) !== '';

        // Source info
        context.source = system.source ?? {};
        const source = context.source as Record<string, unknown>;
        context.hasSource = source.book !== undefined || source.page !== undefined;

        // Characteristic modifiers
        const contextData = context as Record<string, unknown> & {
            characteristics: Array<Record<string, unknown>>;
            skills: Array<Record<string, unknown>>;
            talents: unknown[];
            traits: unknown[];
            equipment: Array<Record<string, unknown>>;
            specialAbilities: unknown[];
            choices: Array<Record<string, unknown>>;
        };
        contextData.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                contextData.characteristics.push({
                    key: key,
                    label: getCharacteristicDisplayInfo(key).label,
                    short: getCharacteristicDisplayInfo(key).short,
                    value: value,
                    positive: value > 0,
                });
            }
        }
        context.hasCharacteristics = contextData.characteristics.length > 0;

        // Wounds/Fate formulas
        context.woundsFormula = grants.woundsFormula ?? null;
        context.fateFormula = grants.fateFormula ?? null;
        context.hasFormulas = context.woundsFormula !== null || context.fateFormula !== null;

        // Skills
        interface GrantSkill {
            name: string;
            specialization?: string;
            level?: string;
        }
        contextData.skills = (Array.isArray(grants.skills) ? (grants.skills as GrantSkill[]) : []).map((skill) => ({
            name: skill.name,
            specialization: skill.specialization ?? null,
            level: skill.level ?? 'trained',
            levelLabel: getTrainingLabel(skill.level ?? ''),
            displayName: skill.specialization !== undefined ? `${skill.name} (${skill.specialization})` : skill.name,
        }));
        context.hasSkills = contextData.skills.length > 0;

        // Talents
        interface GrantTalent {
            name: string;
            specialization?: string;
            uuid?: string;
        }
        contextData.talents = await this._prepareTalents(Array.isArray(grants.talents) ? (grants.talents as GrantTalent[]) : []);
        context.hasTalents = contextData.talents.length > 0;

        // Traits
        interface GrantTrait {
            name: string;
            level?: string;
            uuid?: string;
        }
        contextData.traits = await this._prepareTraits(Array.isArray(grants.traits) ? (grants.traits as GrantTrait[]) : []);
        context.hasTraits = contextData.traits.length > 0;

        // Equipment
        interface GrantEquipment {
            name?: string;
            quantity?: number;
            uuid?: string;
        }
        contextData.equipment = (Array.isArray(grants.equipment) ? (grants.equipment as GrantEquipment[]) : []).map((item) => ({
            name: item.name ?? '',
            quantity: item.quantity ?? 1,
            uuid: item.uuid ?? null,
        }));
        context.hasEquipment = contextData.equipment.length > 0;

        // Special Abilities
        contextData.specialAbilities = Array.isArray(grants.specialAbilities) ? grants.specialAbilities : [];
        context.hasSpecialAbilities = contextData.specialAbilities.length > 0;

        // Choices
        interface GrantChoiceOption {
            label: string;
            value: string;
            description?: string;
        }
        interface GrantChoice {
            type: string;
            label: string;
            count?: number;
            options: GrantChoiceOption[];
        }
        contextData.choices = (Array.isArray(grants.choices) ? (grants.choices as GrantChoice[]) : []).map((choice) => ({
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
        context.hasChoices = contextData.choices.length > 0;

        // Requirements
        context.requirements = system.requirements ?? {};
        const requirements = context.requirements as Record<string, unknown>;
        const prevStepsLen = (requirements.previousSteps as unknown[] | undefined)?.length ?? 0;
        const exclStepsLen = (requirements.excludedSteps as unknown[] | undefined)?.length ?? 0;
        context.hasRequirements = requirements.text !== undefined || prevStepsLen > 0 || exclStepsLen > 0;

        return context;
    }

    /**
     * Prepare talents with item lookup
     * @param talents
     * @private
     */
    async _prepareTalents(
        talents: { name: string; specialization?: string; uuid?: string }[],
    ): Promise<{ name: string; specialization: string | null; uuid: string | null; description: string | null; hasItem: boolean }[]> {
        const prepared = [];
        for (const talent of talents) {
            let item: { system?: { description?: { value?: string } } } | null = null;
            if (talent.uuid !== undefined) {
                try {
                    item = await fromUuid(talent.uuid);
                } catch {
                    // Item not found
                }
            }
            prepared.push({
                name: talent.name,
                specialization: talent.specialization ?? null,
                uuid: talent.uuid ?? null,
                description: item?.system?.description?.value ?? null,
                hasItem: item !== null,
            });
        }
        return prepared;
    }

    /**
     * Prepare traits with item lookup
     * @param traits
     * @private
     */
    async _prepareTraits(
        traits: { name: string; level?: string; uuid?: string }[],
    ): Promise<{ name: string; level: string | null; uuid: string | null; description: string | null; hasItem: boolean }[]> {
        const prepared = [];
        for (const trait of traits) {
            let item: { system?: { description?: { value?: string } } } | null = null;
            if (trait.uuid !== undefined) {
                try {
                    item = await fromUuid(trait.uuid);
                } catch {
                    // Item not found
                }
            }
            prepared.push({
                name: trait.name,
                level: trait.level ?? null,
                uuid: trait.uuid ?? null,
                description: item?.system?.description?.value ?? null,
                hasItem: item !== null,
            });
        }
        return prepared;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Get localized step label
     * @param {string} step
     * @returns {string}
     * @private
     */
    _getStepLabel(step: string): string {
        if (step === '') return '';
        const key = step.charAt(0).toUpperCase() + step.slice(1);
        return game.i18n.localize(`WH40K.OriginPath.${key}`);
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Confirm selection
     * @param {OriginDetailDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     * @private
     */
    static #confirm(this: OriginDetailDialog, event: PointerEvent, target: HTMLElement): void {
        if (this._resolvePromise !== null) {
            this._resolvePromise({ selected: true, origin: this.origin });
        }
        void this.close();
    }

    /**
     * Cancel dialog
     * @param {OriginDetailDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     * @private
     */
    static #cancel(this: OriginDetailDialog, event: PointerEvent, target: HTMLElement): void {
        if (this._resolvePromise !== null) {
            this._resolvePromise({ selected: false, origin: null });
        }
        void this.close();
    }

    /**
     * Open an item sheet
     * @param {OriginDetailDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     * @private
     */
    static async #openItem(this: OriginDetailDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        const uuid = target.dataset.uuid;
        if (uuid === undefined || uuid === '') return;

        try {
            const item = (await fromUuid(uuid)) as unknown as { sheet?: { render(force: boolean): void } } | null;
            if (item?.sheet !== undefined) {
                item.sheet.render(true);
            }
        } catch {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.ItemNotFound'));
        }
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Show the detail dialog and await user decision
     * @param {WH40KItem} origin - The origin path item
     * @param {Record<string, unknown>} [options={}] - Additional options
     * @returns {Promise<{selected: boolean, origin: WH40KItem|null}>}
     */
    static async show(origin: WH40KItem, options: Record<string, unknown> = {}): Promise<{ selected: boolean; origin: WH40KItem | null }> {
        const dialog = new OriginDetailDialog(origin, options);

        const result = new Promise<{ selected: boolean; origin: WH40KItem | null }>((resolve) => {
            dialog._resolvePromise = resolve;
        });

        await dialog.render(true);

        return result;
    }

    /** @override */
    async close(options: Record<string, unknown> = {}): Promise<void> {
        // Resolve with cancelled if not already resolved
        if (this._resolvePromise !== null) {
            this._resolvePromise({ selected: false, origin: null });
            this._resolvePromise = null;
        }
        await super.close(options);
    }
}
