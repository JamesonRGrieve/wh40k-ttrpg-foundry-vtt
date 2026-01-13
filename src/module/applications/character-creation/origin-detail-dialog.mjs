/**
 * Origin Detail Dialog
 * 
 * Full-screen dialog showing complete details for an origin path choice,
 * with a confirm button to select it.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginDetailDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "origin-detail-dialog"],
        tag: "div",
        window: {
            title: "RT.OriginPath.ViewDetails",
            icon: "fa-solid fa-scroll",
            minimizable: false,
            resizable: true
        },
        position: {
            width: 700,
            height: 600
        },
        actions: {
            confirm: OriginDetailDialog.#confirm,
            cancel: OriginDetailDialog.#cancel,
            openItem: OriginDetailDialog.#openItem
        }
    };

    /** @override */
    static PARTS = {
        content: {
            template: "systems/rogue-trader/templates/character-creation/origin-detail-dialog.hbs",
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /**
     * @param {Item} origin - The origin path item to display
     * @param {object} [options={}] - Additional options
     * @param {boolean} [options.allowSelection=true] - Whether to show the confirm button
     * @param {boolean} [options.isSelected=false] - Whether this origin is already selected
     */
    constructor(origin, options = {}) {
        super(options);
        
        /**
         * The origin path item
         * @type {Item}
         */
        this.origin = origin;

        /**
         * Whether selection is allowed
         * @type {boolean}
         */
        this.allowSelection = options.allowSelection !== false;

        /**
         * Whether this origin is already selected
         * @type {boolean}
         */
        this.isSelected = options.isSelected || false;

        /**
         * Promise resolver for awaiting user input
         * @type {Function|null}
         * @private
         */
        this._resolvePromise = null;
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
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const system = this.origin.system;
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
        context.description = system?.description?.value || "";
        context.hasDescription = !!context.description;

        // Source info
        context.source = system?.source || {};
        context.hasSource = !!(context.source.book || context.source.page);

        // Characteristic modifiers
        context.characteristics = [];
        for (const [key, value] of Object.entries(modifiers)) {
            if (value !== 0) {
                context.characteristics.push({
                    key: key,
                    label: this._getCharacteristicLabel(key),
                    short: this._getCharacteristicShort(key),
                    value: value,
                    positive: value > 0
                });
            }
        }
        context.hasCharacteristics = context.characteristics.length > 0;

        // Wounds/Fate formulas
        context.woundsFormula = grants.woundsFormula || null;
        context.fateFormula = grants.fateFormula || null;
        context.hasFormulas = !!(context.woundsFormula || context.fateFormula);

        // Skills
        context.skills = (grants.skills || []).map(skill => ({
            name: skill.name,
            specialization: skill.specialization || null,
            level: skill.level || "trained",
            levelLabel: this._getTrainingLabel(skill.level),
            displayName: skill.specialization ? `${skill.name} (${skill.specialization})` : skill.name
        }));
        context.hasSkills = context.skills.length > 0;

        // Talents
        context.talents = await this._prepareTalents(grants.talents || []);
        context.hasTalents = context.talents.length > 0;

        // Traits
        context.traits = await this._prepareTraits(grants.traits || []);
        context.hasTraits = context.traits.length > 0;

        // Equipment
        context.equipment = (grants.equipment || []).map(item => ({
            name: item.name || item,
            quantity: item.quantity || 1,
            uuid: item.uuid || null
        }));
        context.hasEquipment = context.equipment.length > 0;

        // Special Abilities
        context.specialAbilities = grants.specialAbilities || [];
        context.hasSpecialAbilities = context.specialAbilities.length > 0;

        // Choices
        context.choices = (grants.choices || []).map(choice => ({
            type: choice.type,
            typeLabel: this._getChoiceTypeLabel(choice.type),
            label: choice.label,
            count: choice.count || 1,
            options: choice.options.map(opt => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || ""
            }))
        }));
        context.hasChoices = context.choices.length > 0;

        // Requirements
        context.requirements = system?.requirements || {};
        context.hasRequirements = !!(context.requirements.text || 
            context.requirements.previousSteps?.length || 
            context.requirements.excludedSteps?.length);

        return context;
    }

    /**
     * Prepare talents with item lookup
     * @param {Array} talents
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTalents(talents) {
        const prepared = [];
        for (const talent of talents) {
            let item = null;
            if (talent.uuid) {
                try {
                    item = await fromUuid(talent.uuid);
                } catch (e) {
                    // Item not found
                }
            }
            prepared.push({
                name: talent.name,
                specialization: talent.specialization || null,
                uuid: talent.uuid || null,
                description: item?.system?.description?.value || null,
                hasItem: !!item
            });
        }
        return prepared;
    }

    /**
     * Prepare traits with item lookup
     * @param {Array} traits
     * @returns {Promise<Array>}
     * @private
     */
    async _prepareTraits(traits) {
        const prepared = [];
        for (const trait of traits) {
            let item = null;
            if (trait.uuid) {
                try {
                    item = await fromUuid(trait.uuid);
                } catch (e) {
                    // Item not found
                }
            }
            prepared.push({
                name: trait.name,
                level: trait.level || null,
                uuid: trait.uuid || null,
                description: item?.system?.description?.value || null,
                hasItem: !!item
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
    _getStepLabel(step) {
        if (!step) return "";
        const key = step.charAt(0).toUpperCase() + step.slice(1);
        return game.i18n.localize(`RT.OriginPath.${key}`);
    }

    /**
     * Get localized characteristic label
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getCharacteristicLabel(key) {
        const labels = {
            weaponSkill: "Weapon Skill",
            ballisticSkill: "Ballistic Skill",
            strength: "Strength",
            toughness: "Toughness",
            agility: "Agility",
            intelligence: "Intelligence",
            perception: "Perception",
            willpower: "Willpower",
            fellowship: "Fellowship",
            influence: "Influence"
        };
        return labels[key] || key;
    }

    /**
     * Get characteristic short label
     * @param {string} key
     * @returns {string}
     * @private
     */
    _getCharacteristicShort(key) {
        const shorts = {
            weaponSkill: "WS",
            ballisticSkill: "BS",
            strength: "S",
            toughness: "T",
            agility: "Ag",
            intelligence: "Int",
            perception: "Per",
            willpower: "WP",
            fellowship: "Fel",
            influence: "Inf"
        };
        return shorts[key] || key.substring(0, 3).toUpperCase();
    }

    /**
     * Get training level label
     * @param {string} level
     * @returns {string}
     * @private
     */
    _getTrainingLabel(level) {
        const labels = {
            trained: "Trained",
            plus10: "+10",
            plus20: "+20"
        };
        return labels[level] || level;
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
        return labels[type] || type;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Confirm selection
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #confirm(event, target) {
        if (this._resolvePromise) {
            this._resolvePromise({ selected: true, origin: this.origin });
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
            this._resolvePromise({ selected: false, origin: null });
        }
        this.close();
    }

    /**
     * Open an item sheet
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #openItem(event, target) {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = await fromUuid(uuid);
            if (item?.sheet) {
                item.sheet.render(true);
            }
        } catch (e) {
            ui.notifications.warn(game.i18n.localize("RT.OriginPath.ItemNotFound"));
        }
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Show the detail dialog and await user decision
     * @param {Item} origin - The origin path item
     * @param {object} [options={}] - Additional options
     * @returns {Promise<{selected: boolean, origin: Item|null}>}
     */
    static async show(origin, options = {}) {
        const dialog = new OriginDetailDialog(origin, options);
        
        const result = new Promise(resolve => {
            dialog._resolvePromise = resolve;
        });

        await dialog.render(true);
        
        return result;
    }

    /** @override */
    async close(options = {}) {
        // Resolve with cancelled if not already resolved
        if (this._resolvePromise) {
            this._resolvePromise({ selected: false, origin: null });
            this._resolvePromise = null;
        }
        return super.close(options);
    }
}
