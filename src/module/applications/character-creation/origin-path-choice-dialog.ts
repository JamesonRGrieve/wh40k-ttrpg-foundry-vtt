/**
 * Origin Path Choice Dialog
 *
 * Modal dialog for selecting choices when an origin path item
 * has multiple options (e.g., "Choose 1 of 3 talents").
 */

import { findSkillUuid } from '../../helpers/skill-uuid-helper.ts';
import { getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginPathChoiceDialog extends HandlebarsApplicationMixin(ApplicationV2 as any) {
    [key: string]: any;
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'origin-choice-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.OriginPath.MakeChoices',
            icon: 'fa-solid fa-list-check',
            minimizable: false,
            resizable: true,
        },
        position: {
            width: 700,
            height: 'auto' as const,
        },
        actions: {
            toggleOption: OriginPathChoiceDialog.#toggleOption,
            selectSpecialization: OriginPathChoiceDialog.#selectSpecialization,
            confirm: OriginPathChoiceDialog.#confirm,
            cancel: OriginPathChoiceDialog.#cancel,
            viewItem: OriginPathChoiceDialog.#viewItem,
        },
        form: {
            handler: OriginPathChoiceDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/character-creation/origin-path-choice-dialog.hbs',
        },
    };

    /* -------------------------------------------- */

    /**
     * @param {object} item - The origin path item with choices
     * @param {Actor} actor - The character actor (for context)
     * @param {object} [options={}] - Additional options
     */
    constructor(item, actor, options = {}) {
        super(options);

        /**
         * The origin path item
         * @type {object}
         */
        this.item = item;

        /**
         * The character actor
         * @type {Actor}
         */
        this.actor = actor;

        /**
         * Pending choices that need selection
         * @type {Array<{type: string, label: string, options: object[], count: number}>}
         */
        // Normalize choices: DH2e uses 'name' while RT uses 'label'
        this.pendingChoices = (item.system?.grants?.choices || []).map((c) => ({
            ...c,
            label: c.label || c.name || '',
            options: (c.options || []).map((o) => ({
                ...o,
                value: o.value || o.name || '',
                label: o.label || o.name || '',
                specializations: o.specializations || null,
            })),
        }));

        /**
         * Selected options for each choice.
         * Values are the final composite strings, e.g. "Weapon Training (Chain)".
         * @type {Map<string, Set<string>>}
         */
        this.selections = new Map();

        /**
         * Chosen specialization per option, keyed by `choiceLabel::optionValue`.
         * @type {Map<string, string>}
         */
        this.specializationSelections = new Map();

        // Initialize selections from existing selectedChoices
        const existing = item.system?.selectedChoices || {};
        for (const [label, selected] of Object.entries(existing) as [string, any][]) {
            this.selections.set(label, new Set(selected));
            // Reverse-engineer specialization selections from composite values
            for (const sel of selected) {
                const match = sel.match(/^(.+?)\s*\((.+)\)$/);
                if (match) {
                    const baseValue = match[1].trim();
                    const spec = match[2].trim();
                    // Find the option that has specializations
                    const choice = this.pendingChoices.find((c) => (c.label || c.name) === label);
                    const option = choice?.options?.find((o) => o.value === baseValue || o.label === baseValue);
                    if (option?.specializations) {
                        this.specializationSelections.set(`${label}::${option.value}`, spec);
                    }
                }
            }
        }

        /**
         * Promise resolver for awaiting user input
         * @type {Function|null}
         * @private
         */
        this._resolvePromise = null;
    }

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: any): Promise<any> {
        const context = await super._prepareContext(options) as any;

        context.item = this.item;
        context.itemName = this.item.name;
        context.itemImg = this.item.img;

        // Prepare choices with selection state
        context.choices = await Promise.all(
            this.pendingChoices.map(async (choice) => {
                const selections = this.selections.get(choice.label) || new Set();
                const remaining = choice.count - selections.size;

                return {
                    type: choice.type,
                    typeLabel: this._getChoiceTypeLabel(choice.type),
                    label: choice.label,
                    count: choice.count,
                    remaining: remaining,
                    options: await Promise.all(
                        (choice.options || []).map(async (option) => {
                            // Handle both string and object option formats
                            const optValue = typeof option === 'string' ? option : option.value || option.label;
                            const optLabel = typeof option === 'string' ? option : option.label || option.value;
                            const optDesc = typeof option === 'object' ? option.description : null;
                            const optSpecs = typeof option === 'object' ? (option.specializations || null) : null;

                            // Extract UUID from option.uuid OR from grants (talents/skills/traits/equipment)
                            let optUuid = typeof option === 'object' ? option.uuid : null;
                            if (!optUuid && typeof option === 'object' && option.grants) {
                                // Check grants for items with UUIDs
                                const grants = option.grants;
                                if (grants.talents?.length > 0 && grants.talents[0].uuid) {
                                    optUuid = grants.talents[0].uuid;
                                } else if (grants.skills?.length > 0) {
                                    // Handle skills - they may need UUID lookup
                                    const skillData = grants.skills[0];
                                    if (skillData.uuid) {
                                        optUuid = skillData.uuid;
                                    } else {
                                        // Parse skill name and specialization, then look up UUID
                                        const skillName = skillData.name || skillData;
                                        const specialization = skillData.specialization || null;
                                        optUuid = await findSkillUuid(skillName, specialization);
                                    }
                                } else if (grants.traits?.length > 0 && grants.traits[0].uuid) {
                                    optUuid = grants.traits[0].uuid;
                                } else if (grants.equipment?.length > 0 && grants.equipment[0].uuid) {
                                    optUuid = grants.equipment[0].uuid;
                                }
                            }

                            // Determine if this option is selected (check composite value for specialization options)
                            const specKey = `${choice.label}::${optValue}`;
                            const chosenSpec = this.specializationSelections.get(specKey) || '';
                            const compositeValue = optSpecs && chosenSpec ? `${optValue} (${chosenSpec})` : optValue;
                            const isSelected = selections.has(compositeValue) || (optSpecs && chosenSpec && selections.has(compositeValue));

                            // Check if this option is pending specialization selection
                            const isPendingSpec = this._pendingSpecOption?.choiceLabel === choice.label
                                && this._pendingSpecOption?.optionValue === optValue;

                            return {
                                value: optValue,
                                label: optLabel,
                                description: optDesc,
                                uuid: optUuid,
                                selected: !!isSelected,
                                disabled: !isSelected && !isPendingSpec && remaining <= 0,
                                hasSpecializations: !!optSpecs && optSpecs.length > 0,
                                specializations: optSpecs || [],
                                chosenSpecialization: chosenSpec,
                                pendingSpec: isPendingSpec,
                            };
                        }),
                    ),
                };
            }),
        );

        // Check if all choices are complete
        context.allChoicesComplete = context.choices.every((c) => c.remaining === 0);

        return context;
    }

    /**
     * Get choice type label
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getChoiceTypeLabel(type: string): string {
        return getChoiceTypeLabel(type);
    }

    /** @override */
    _onRender(context: any, options: any): void {
        super._onRender(context, options);

        // Attach change listeners to specialization selects (data-action doesn't fire on change)
        const selects = this.element.querySelectorAll('select[data-action="selectSpecialization"]');
        for (const select of selects) {
            select.addEventListener('change', (event) => {
                OriginPathChoiceDialog.#selectSpecialization.call(this, event, select as HTMLElement);
            });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle an option selection
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #toggleOption(event: Event, target: HTMLElement): Promise<void> {
        const choiceLabel = target.dataset.choice;
        const optionValue = target.dataset.option;

        if (!choiceLabel || !optionValue) return;

        // Get the choice config
        const choice = this.pendingChoices.find((c) => c.label === choiceLabel);
        if (!choice) return;

        const option = choice.options.find((o) => o.value === optionValue);

        // Get current selections for this choice
        if (!this.selections.has(choiceLabel)) {
            this.selections.set(choiceLabel, new Set());
        }
        const selections = this.selections.get(choiceLabel);
        const specKey = `${choiceLabel}::${optionValue}`;

        // Build the composite value (includes specialization if present)
        const chosenSpec = this.specializationSelections.get(specKey) || '';
        const hasSpecs = option?.specializations?.length > 0;
        const compositeValue = hasSpecs && chosenSpec ? `${optionValue} (${chosenSpec})` : optionValue;

        // Find any existing composite for this base option (to remove when deselecting)
        const existingComposite = [...selections].find((v) =>
            v === optionValue || v.startsWith(`${optionValue} (`)
        );

        // Toggle selection
        if (existingComposite) {
            selections.delete(existingComposite);
            this.specializationSelections.delete(specKey);
        } else {
            // If this option has specializations but none chosen yet, just re-render
            // to show the dropdown — don't add to selections until spec is picked
            if (hasSpecs && !chosenSpec) {
                // Mark as "pending specialization" by not adding to selections yet
                // The template will show the dropdown since the card is in a
                // "needs-spec" state. We'll store a temporary flag.
                this._pendingSpecOption = { choiceLabel, optionValue };
                await this.render();
                return;
            }

            // Check if we can add more
            if (selections.size < choice.count) {
                selections.add(compositeValue);
            } else {
                if (choice.count === 1) {
                    selections.clear();
                    if (hasSpecs && !chosenSpec) {
                        this._pendingSpecOption = { choiceLabel, optionValue };
                        await this.render();
                        return;
                    }
                    selections.add(compositeValue);
                } else {
                    (ui.notifications as any).warn(`You can only select ${choice.count} option(s).`);
                    return;
                }
            }
        }

        this._pendingSpecOption = null;
        await this.render();
    }

    /**
     * Handle specialization dropdown selection.
     * When a specialization is chosen, finalize the option selection with composite value.
     * @private
     */
    static async #selectSpecialization(event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation();
        const select = target.tagName === 'SELECT' ? target as HTMLSelectElement : target.querySelector('select') as HTMLSelectElement;
        if (!select) return;

        const choiceLabel = select.dataset.choice;
        const optionValue = select.dataset.option;
        const specValue = select.value;

        if (!choiceLabel || !optionValue || !specValue) return;

        const choice = this.pendingChoices.find((c) => c.label === choiceLabel);
        if (!choice) return;

        const specKey = `${choiceLabel}::${optionValue}`;
        this.specializationSelections.set(specKey, specValue);

        // Build composite value and add to selections
        const compositeValue = `${optionValue} (${specValue})`;
        if (!this.selections.has(choiceLabel)) {
            this.selections.set(choiceLabel, new Set());
        }
        const selections = this.selections.get(choiceLabel);

        // Remove any existing composite for this base option
        const existing = [...selections].find((v) =>
            v === optionValue || v.startsWith(`${optionValue} (`)
        );
        if (existing) selections.delete(existing);

        // Add the new composite
        if (selections.size < choice.count) {
            selections.add(compositeValue);
        } else if (choice.count === 1) {
            selections.clear();
            selections.add(compositeValue);
        }

        this._pendingSpecOption = null;
        await this.render();
    }

    /**
     * Confirm selections
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #confirm(event: Event, target: HTMLElement): Promise<void> {
        // Validate all choices are complete
        const incomplete = this.pendingChoices.filter((choice) => {
            const selections = this.selections.get(choice.label) || new Set();
            return selections.size < choice.count;
        });

        if (incomplete.length > 0) {
            (ui.notifications as any).warn('Please complete all required choices.');
            return;
        }

        // Convert Map to object for storage
        const selectedChoices = {};
        for (const [label, selections] of this.selections.entries()) {
            selectedChoices[label] = Array.from(selections);
        }

        // Resolve promise with selections
        if (this._resolvePromise) {
            this._resolvePromise(selectedChoices);
        }

        this.close();
    }

    /**
     * Cancel dialog
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #cancel(event: Event, target: HTMLElement): Promise<void> {
        if (this._resolvePromise) {
            this._resolvePromise(null);
        }
        this.close();
    }

    /**
     * View an item's sheet (for choices with UUIDs)
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #viewItem(event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Don't trigger parent card click
        event.preventDefault(); // Prevent default button behavior

        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = await fromUuid(uuid) as any;
            if (item) {
                item.sheet.render(true);
            }
        } catch (error) {
            console.warn('Could not load item:', uuid, error);
            (ui.notifications as any).warn('Could not find that item.');
        }
    }

    /**
     * Form submit handler
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    static async #onSubmit(event: Event, form: HTMLFormElement, formData: any): Promise<void> {
        // Same as confirm - call directly on instance
        return OriginPathChoiceDialog.#confirm.call(this, event, form);
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Show the choice dialog and await user selection
     * @param {object} item - The origin path item
     * @param {Actor} actor - The character actor
     * @returns {Promise<object|null>} The selected choices or null if cancelled
     */
    static async show(item: any, actor: any): Promise<any> {
        const dialog = new OriginPathChoiceDialog(item, actor);

        // Create promise that will be resolved when user confirms/cancels
        const result = new Promise((resolve) => {
            dialog._resolvePromise = resolve;
        });

        await dialog.render(true);

        return result;
    }
}
