/**
 * @file RollConfigurationDialog - General roll configuration dialog
 * ApplicationV2 dialog for configuring d100 tests
 *
 * Features:
 * - Display target number
 * - Difficulty modifier presets
 * - Custom modifier input
 * - Roll mode selection
 * - Live target calculation
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class RollConfigurationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'roll-configuration-{id}',
        classes: ['rogue-trader', 'roll-configuration-dialog'],
        tag: 'form',
        window: {
            title: 'RT.Roll.ConfigureRoll',
            icon: 'fa-solid fa-dice-d20',
            minimizable: false,
            resizable: false,
        },
        position: {
            width: 400,
            height: 'auto',
        },
        form: {
            handler: RollConfigurationDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            selectDifficulty: RollConfigurationDialog.#selectDifficulty,
            toggleSituational: RollConfigurationDialog.#toggleSituational,
            cancel: RollConfigurationDialog.#cancel,
            viewModifierSource: RollConfigurationDialog.#viewModifierSource,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/dialogs/roll-configuration.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Standard difficulty modifiers for Rogue Trader
     * @type {Array<{label: string, value: number, key: string}>}
     */
    static DIFFICULTY_PRESETS = [
        { key: 'trivial', label: 'RT.Difficulty.Trivial', value: 60 },
        { key: 'elementary', label: 'RT.Difficulty.Elementary', value: 50 },
        { key: 'easy', label: 'RT.Difficulty.Easy', value: 40 },
        { key: 'routine', label: 'RT.Difficulty.Routine', value: 30 },
        { key: 'ordinary', label: 'RT.Difficulty.Ordinary', value: 20 },
        { key: 'challenging', label: 'RT.Difficulty.Challenging', value: 10 },
        { key: 'difficult', label: 'RT.Difficulty.Difficult', value: 0 },
        { key: 'hard', label: 'RT.Difficulty.Hard', value: -10 },
        { key: 'veryHard', label: 'RT.Difficulty.VeryHard', value: -20 },
        { key: 'arduous', label: 'RT.Difficulty.Arduous', value: -30 },
        { key: 'punishing', label: 'RT.Difficulty.Punishing', value: -40 },
        { key: 'hellish', label: 'RT.Difficulty.Hellish', value: -50 },
        { key: 'infernal', label: 'RT.Difficulty.Infernal', value: -60 },
    ];

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * The actor making the roll
     * @type {Actor|null}
     */
    actor = null;

    /**
     * Roll configuration data
     * @type {Object}
     */
    config = {};

    /**
     * Selected difficulty key
     * @type {string}
     */
    selectedDifficulty = 'difficult';

    /**
     * Custom modifier value
     * @type {number}
     */
    customModifier = 0;

    /**
     * Active situational modifiers (those checked by the user)
     * @type {Set<string>}
     */
    activeSituationalModifiers = new Set();

    /**
     * Promise resolver for async result
     * @type {Function|null}
     */
    #resolve = null;

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Object} config - Roll configuration
     * @param {Actor} [config.actor] - The actor making the roll
     * @param {number} [config.target] - Base target number
     * @param {string} [config.flavor] - Roll flavor/name
     * @param {Object} [options] - Application options
     */
    constructor(config = {}, options = {}) {
        super(options);
        this.config = foundry.utils.deepClone(config);
        this.actor = config.actor || null;
        this.selectedDifficulty = config.difficulty || 'difficult';
        this.customModifier = config.customModifier || 0;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Calculate the difficulty modifier
        const difficultyPreset = this.constructor.DIFFICULTY_PRESETS.find((p) => p.key === this.selectedDifficulty) || { value: 0 };
        const difficultyModifier = difficultyPreset.value;

        // Calculate situational modifier from active checkboxes
        const situationalModifierTotal = this._calculateSituationalTotal();

        // Prepare permanent modifiers (from items, conditions, etc.)
        const permanentModifiers = (this.config.permanentModifiers || []).map(mod => ({
            ...mod,
            valueDisplay: mod.value > 0 ? `+${mod.value}` : mod.value.toString(),
            hasSource: !!mod.uuid
        }));
        const hasPermanentModifiers = permanentModifiers.length > 0;

        // Calculate permanent modifier total
        const permanentModifierTotal = permanentModifiers.reduce((sum, mod) => sum + (mod.value || 0), 0);

        // Calculate total modifier and final target
        const totalModifier = difficultyModifier + this.customModifier + situationalModifierTotal + permanentModifierTotal;
        const baseTarget = this.config.target || 0;
        const finalTarget = Math.max(1, Math.min(100, baseTarget + totalModifier));

        // Prepare situational modifiers for display
        const situationalModifiers = (this.config.situationalModifiers || []).map((mod, index) => ({
            ...mod,
            id: `sit-${index}`,
            active: this.activeSituationalModifiers.has(`sit-${index}`),
            valueDisplay: mod.value > 0 ? `+${mod.value}` : mod.value.toString()
        }));
        const hasSituationalModifiers = situationalModifiers.length > 0;

        return {
            ...context,
            // Actor info
            actor: this.actor,
            actorName: this.actor?.name || '',
            actorImg: this.actor?.img || 'icons/svg/mystery-man.svg',

            // Roll info
            rollName: this.config.flavor || this.config.name || 'Test',
            baseTarget: baseTarget,
            finalTarget: finalTarget,

            // Modifiers
            difficultyModifier: difficultyModifier,
            customModifier: this.customModifier,
            situationalModifierTotal,
            permanentModifierTotal,
            totalModifier: totalModifier,
            
            // Situational modifiers
            situationalModifiers,
            hasSituationalModifiers,

            // Permanent modifiers
            permanentModifiers,
            hasPermanentModifiers,

            // Difficulty presets
            difficulties: this.constructor.DIFFICULTY_PRESETS.map((d) => ({
                ...d,
                label: game.i18n.localize(d.label),
                selected: d.key === this.selectedDifficulty,
                cssClass: d.value > 0 ? 'positive' : d.value < 0 ? 'negative' : 'neutral',
            })),
            selectedDifficulty: this.selectedDifficulty,

            // Roll modes - V13: rollModes values are objects with a label property
            rollModes: Object.entries(CONFIG.Dice.rollModes).map(([key, mode]) => ({
                key: key,
                label: game.i18n.localize(mode.label),
                selected: key === (this.config.rollMode || game.settings.get('core', 'rollMode')),
            })),

            // Form buttons
            buttons: [
                { type: 'submit', icon: 'fa-solid fa-dice-d20', label: 'RT.Roll.Roll', cssClass: 'primary' },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /**
     * Calculate the total from active situational modifiers.
     * @returns {number}
     * @private
     */
    _calculateSituationalTotal() {
        let total = 0;
        const situationalModifiers = this.config.situationalModifiers || [];
        for (let i = 0; i < situationalModifiers.length; i++) {
            if (this.activeSituationalModifiers.has(`sit-${i}`)) {
                total += situationalModifiers[i].value || 0;
            }
        }
        return total;
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Add live update for custom modifier
        const customInput = this.element.querySelector('input[name="customModifier"]');
        if (customInput) {
            customInput.addEventListener('change', this.#onCustomModifierChange.bind(this));
        }

        // Add live update for difficulty select
        const difficultySelect = this.element.querySelector('select[name="difficulty"]');
        if (difficultySelect) {
            difficultySelect.addEventListener('change', this.#onDifficultyChange.bind(this));
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle custom modifier input change
     * @param {Event} event
     */
    #onCustomModifierChange(event) {
        this.customModifier = parseInt(event.currentTarget.value) || 0;
        this.render({ parts: ['form'] });
    }

    /**
     * Handle difficulty selection change
     * @param {Event} event
     */
    #onDifficultyChange(event) {
        this.selectedDifficulty = event.currentTarget.value;
        this.render({ parts: ['form'] });
    }

    /**
     * Cancel the dialog
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #cancel(event, target) {
        // Note: 'this' is bound to the instance by ApplicationV2 action handler system
        this.close();
    }

    /**
     * View the source of a permanent modifier
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #viewModifierSource(event, target) {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        const item = await fromUuid(uuid);
        if (item) {
            // Check for Shift+Click to post to chat
            if (event.shiftKey) {
                item.toMessage();
            } else {
                // Default: open sheet
                item.sheet.render(true);
            }
        }
    }

    /**
     * Handle situational modifier toggle
     * @this {RollConfigurationDialog}
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #toggleSituational(event, target) {
        const modId = target.dataset.modifierId;
        if (this.activeSituationalModifiers.has(modId)) {
            this.activeSituationalModifiers.delete(modId);
        } else {
            this.activeSituationalModifiers.add(modId);
        }
        this.render({ parts: ['form'] });
    }

    /**
     * Handle cancel button
     * @this {RollConfigurationDialog}
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #cancel(event, target) {
        // Note: 'this' is bound to the instance by ApplicationV2 action handler system
        this.close();
    }

    /**
     * Handle form submission
     * @param {Event} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static async #onSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);

        // Get final values
        const difficultyPreset = this.constructor.DIFFICULTY_PRESETS.find((p) => p.key === data.difficulty) || { value: 0 };

        // Calculate situational modifier total
        const situationalTotal = this._calculateSituationalTotal();

        const result = {
            ...this.config,
            difficulty: data.difficulty,
            difficultyModifier: difficultyPreset.value,
            customModifier: parseInt(data.customModifier) || 0,
            situationalModifier: situationalTotal,
            rollMode: data.rollMode,
            target: (this.config.target || 0) + difficultyPreset.value + (parseInt(data.customModifier) || 0) + situationalTotal,
            baseTarget: this.config.target || 0,
            modifiers: {
                ...this.config.modifiers,
                difficulty: difficultyPreset.value,
                custom: parseInt(data.customModifier) || 0,
                situational: situationalTotal,
            },
        };

        if (this.#resolve) {
            this.#resolve(result);
        }

        return result;
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Show the dialog and wait for result
     * @returns {Promise<Object|null>} The configuration result, or null if cancelled
     */
    async wait() {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            this.render(true);
        });
    }

    /** @override */
    async close(options = {}) {
        // Ensure we resolve with null if closed without submitting
        if (this.#resolve && !options.submitted) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Create and show a roll configuration dialog
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object|null>} Configuration result or null if cancelled
     */
    static async configure(config = {}) {
        const dialog = new this(config);
        return dialog.wait();
    }
}
