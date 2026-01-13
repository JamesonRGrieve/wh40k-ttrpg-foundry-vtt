/**
 * Origin Path Choice Dialog
 * 
 * Modal dialog for selecting choices when an origin path item
 * has multiple options (e.g., "Choose 1 of 3 talents").
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginPathChoiceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "origin-choice-dialog"],
        tag: "form",
        window: {
            title: "RT.OriginPath.MakeChoices",
            icon: "fa-solid fa-list-check",
            minimizable: false,
            resizable: true
        },
        position: {
            width: 700,
            height: "auto"
        },
        actions: {
            toggleOption: OriginPathChoiceDialog.#toggleOption,
            confirm: OriginPathChoiceDialog.#confirm,
            cancel: OriginPathChoiceDialog.#cancel,
            viewItem: OriginPathChoiceDialog.#viewItem
        },
        form: {
            handler: OriginPathChoiceDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/character-creation/origin-path-choice-dialog.hbs"
        }
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
         * @type {Array<{type: string, label: string, options: string[], count: number}>}
         */
        this.pendingChoices = item.system?.grants?.choices || [];

        /**
         * Selected options for each choice
         * @type {Map<string, Set<string>>}
         */
        this.selections = new Map();

        // Initialize selections from existing selectedChoices
        const existing = item.system?.selectedChoices || {};
        for (const [label, selected] of Object.entries(existing)) {
            this.selections.set(label, new Set(selected));
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
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.item = this.item;
        context.itemName = this.item.name;
        context.itemImg = this.item.img;
        
        // Prepare choices with selection state
        context.choices = this.pendingChoices.map(choice => {
            const selections = this.selections.get(choice.label) || new Set();
            const remaining = choice.count - selections.size;
            
            return {
                type: choice.type,
                typeLabel: this._getChoiceTypeLabel(choice.type),
                label: choice.label,
                count: choice.count,
                remaining: remaining,
                options: (choice.options || []).map(option => {
                    // Handle both string and object option formats
                    const optValue = typeof option === "string" ? option : (option.value || option.label);
                    const optLabel = typeof option === "string" ? option : (option.label || option.value);
                    const optDesc = typeof option === "object" ? option.description : null;
                    
                    return {
                        value: optValue,
                        label: optLabel,
                        description: optDesc,
                        selected: selections.has(optValue),
                        disabled: !selections.has(optValue) && remaining <= 0
                    };
                })
            };
        });

        // Check if all choices are complete
        context.allChoicesComplete = context.choices.every(c => c.remaining === 0);

        return context;
    }

    /**
     * Get choice type label
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getChoiceTypeLabel(type) {
        const labels = {
            talent: "Talent",
            skill: "Skill",
            characteristic: "Characteristic",
            equipment: "Equipment",
            trait: "Trait"
        };
        return labels[type] || type || "Choice";
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
    static async #toggleOption(event, target) {
        const choiceLabel = target.dataset.choice;
        const optionValue = target.dataset.option;

        if (!choiceLabel || !optionValue) return;

        // Get the choice config
        const choice = this.pendingChoices.find(c => c.label === choiceLabel);
        if (!choice) return;

        // Get current selections for this choice
        if (!this.selections.has(choiceLabel)) {
            this.selections.set(choiceLabel, new Set());
        }
        const selections = this.selections.get(choiceLabel);

        // Toggle selection
        if (selections.has(optionValue)) {
            selections.delete(optionValue);
        } else {
            // Check if we can add more
            if (selections.size < choice.count) {
                selections.add(optionValue);
            } else {
                // Replace oldest selection if single choice
                if (choice.count === 1) {
                    selections.clear();
                    selections.add(optionValue);
                } else {
                    ui.notifications.warn(`You can only select ${choice.count} option(s).`);
                    return;
                }
            }
        }

        // Re-render to update UI
        await this.render();
    }

    /**
     * Confirm selections
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #confirm(event, target) {
        // Validate all choices are complete
        const incomplete = this.pendingChoices.filter(choice => {
            const selections = this.selections.get(choice.label) || new Set();
            return selections.size < choice.count;
        });

        if (incomplete.length > 0) {
            ui.notifications.warn("Please complete all required choices.");
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
    static async #cancel(event, target) {
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
    static async #viewItem(event, target) {
        event.stopPropagation(); // Don't trigger parent card click
        
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        
        try {
            const item = await fromUuid(uuid);
            if (item) {
                item.sheet.render(true);
            }
        } catch (error) {
            console.warn("Could not load item:", uuid, error);
            ui.notifications.warn("Could not find that item.");
        }
    }

    /**
     * Form submit handler
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    static async #onSubmit(event, form, formData) {
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
    static async show(item, actor) {
        const dialog = new OriginPathChoiceDialog(item, actor);
        
        // Create promise that will be resolved when user confirms/cancels
        const result = new Promise(resolve => {
            dialog._resolvePromise = resolve;
        });

        await dialog.render(true);
        
        return result;
    }
}
