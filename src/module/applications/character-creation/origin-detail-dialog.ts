/**
 * Origin Detail Dialog
 *
 * Full-screen dialog showing complete details for an origin path choice,
 * with a confirm button to select it.
 */

import { getCharacteristicDisplayInfo, getTrainingLabel, getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';
import type { WH40KItem } from '../../documents/item.ts';

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
        this.isSelected = !!options.isSelected;
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return this.origin.name;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const system = this.origin.system as any;
        const grants = system?.grants || {};
        const modifiers = system?.modifiers?.characteristics || {};

        context.origin = this.origin;
        context.allowSelection = this.allowSelection;
        context.isSelected = this.isSelected;

        // Basic info
        context.name = this.origin.name;
        context.img = this.origin.img;
        context.step = system?.step;
        context.stepLabel = this._getStepLabel(system?.step);
        context.xpCost = system?.xpCost || 0;
        context.isAdvanced = system?.isAdvancedOrigin || false;

        // Description - parse HTML properly
        context.description = system?.description?.value || '';
        context.hasDescription = !!context.description;

        // Source info
        context.source = system?.source || {};
        context.hasSource = !!((context.source as any).book || (context.source as any).page);

        // Characteristic modifiers
        context.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if ((value as number) !== 0) {
                context.characteristics.push({
                    key: key,
                    label: getCharacteristicDisplayInfo(key).label,
                    short: getCharacteristicDisplayInfo(key).short,
                    value: value,
                    positive: (value as number) > 0,
                });
            }
        }
        context.hasCharacteristics = context.characteristics.length > 0;

        // Wounds/Fate formulas
        context.woundsFormula = grants.woundsFormula || null;
        context.fateFormula = grants.fateFormula || null;
        context.hasFormulas = !!(context.woundsFormula || context.fateFormula);

        // Skills
        context.skills = (grants.skills || []).map((skill: any) => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || 'trained',
            levelLabel: getTrainingLabel(skill.level),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name,
        }));
        context.hasSkills = (context.skills as any[]).length > 0;

        // Talents
        context.talents = await this._prepareTalents(grants.talents || []);
        context.hasTalents = (context.talents as any[]).length > 0;

        // Traits
        context.traits = await this._prepareTraits(grants.traits || []);
        context.hasTraits = (context.traits as any[]).length > 0;

        // Equipment
        context.equipment = (grants.equipment || []).map((item: any) => ({
            name: item.name || item,
            quantity: item.quantity || 1,
            uuid: item.uuid || null,
        }));
        context.hasEquipment = (context.equipment as any[]).length > 0;

        // Special Abilities
        context.specialAbilities = grants.specialAbilities || [];
        context.hasSpecialAbilities = (context.specialAbilities as any[]).length > 0;

        // Choices
        context.choices = (grants.choices || []).map((choice: any) => ({
            type: choice.type,
            typeLabel: getChoiceTypeLabel(choice.type),
            label: choice.label,
            count: choice.count || 1,
            options: choice.options.map((opt: any) => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || '',
            })),
        }));
        context.hasChoices = (context.choices as any[]).length > 0;

        // Requirements
        context.requirements = system?.requirements || {};
        context.hasRequirements = !!(
            (context.requirements as any).text ||
            (context.requirements as any).previousSteps?.length ||
            (context.requirements as any).excludedSteps?.length
        );

        return context;
    }

    /**
     * Prepare talents with item lookup
     * @param {any[]} talents
     * @returns {Promise<any[]>}
     * @private
     */
    async _prepareTalents(talents: any[]): Promise<any[]> {
        const prepared = [];
        for (const talent of talents) {
            let item: any = null;
            if (talent.uuid) {
                try {
                    item = await fromUuid(talent.uuid);
                } catch {
                    // Item not found
                }
            }
            prepared.push({
                name: talent.name,
                specialization: talent.specialization || null,
                uuid: talent.uuid || null,
                description: item?.system?.description?.value || null,
                hasItem: !!item,
            });
        }
        return prepared;
    }

    /**
     * Prepare traits with item lookup
     * @param {any[]} traits
     * @returns {Promise<any[]>}
     * @private
     */
    async _prepareTraits(traits: any[]): Promise<any[]> {
        const prepared = [];
        for (const trait of traits) {
            let item: any = null;
            if (trait.uuid) {
                try {
                    item = await fromUuid(trait.uuid);
                } catch {
                    // Item not found
                }
            }
            prepared.push({
                name: trait.name,
                level: trait.level || null,
                uuid: trait.uuid || null,
                description: item?.system?.description?.value || null,
                hasItem: !!item,
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
        if (!step) return '';
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
        if (this._resolvePromise) {
            this._resolvePromise({ selected: true, origin: this.origin });
        }
        this.close();
    }

    /**
     * Cancel dialog
     * @param {OriginDetailDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     * @private
     */
    static #cancel(this: OriginDetailDialog, event: PointerEvent, target: HTMLElement): void {
        if (this._resolvePromise) {
            this._resolvePromise({ selected: false, origin: null });
        }
        this.close();
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
        if (!uuid) return;

        try {
            const item = (await fromUuid(uuid)) as any;
            if (item?.sheet) {
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
        if (this._resolvePromise) {
            this._resolvePromise({ selected: false, origin: null });
            this._resolvePromise = null;
        }
        return super.close(options);
    }
}
