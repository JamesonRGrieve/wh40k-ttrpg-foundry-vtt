/**
 * @gulpfile.js RollConfigurationDialog - General roll configuration dialog
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

interface DifficultyPreset {
    key: string;
    label: string;
    value: number;
}

interface RollConfig extends Record<string, unknown> {
    actor?: Actor | null;
    target?: number;
    flavor?: string;
    difficulty?: string;
    customModifier?: number;
    permanentModifiers?: Array<{ uuid?: string; value: number }>;
    situationalModifiers?: Array<{ value: number }>;
    rollMode?: string;
    name?: string;
    modifiers?: Record<string, number>;
}

export default class RollConfigurationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        id: 'roll-configuration-{id}',
        classes: ['wh40k-rpg', 'roll-configuration-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.Roll.ConfigureRoll',
            icon: 'fa-solid fa-dice-d20',
            resizable: false,
        },
        position: {
            width: 400,
            height: 'auto',
        },
        form: {
            handler: RollConfigurationDialog.#onSubmit as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            toggleSituational: RollConfigurationDialog.#toggleSituational,
            cancel: RollConfigurationDialog.#cancel,
            viewModifierSource: RollConfigurationDialog.#viewModifierSource,
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/roll-configuration.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static DIFFICULTY_PRESETS: DifficultyPreset[] = [
        { key: 'trivial', label: 'WH40K.Difficulty.Trivial', value: 60 },
        { key: 'elementary', label: 'WH40K.Difficulty.Elementary', value: 50 },
        { key: 'easy', label: 'WH40K.Difficulty.Easy', value: 40 },
        { key: 'routine', label: 'WH40K.Difficulty.Routine', value: 30 },
        { key: 'ordinary', label: 'WH40K.Difficulty.Ordinary', value: 20 },
        { key: 'challenging', label: 'WH40K.Difficulty.Challenging', value: 10 },
        { key: 'difficult', label: 'WH40K.Difficulty.Difficult', value: 0 },
        { key: 'hard', label: 'WH40K.Difficulty.Hard', value: -10 },
        { key: 'veryHard', label: 'WH40K.Difficulty.VeryHard', value: -20 },
        { key: 'arduous', label: 'WH40K.Difficulty.Arduous', value: -30 },
        { key: 'punishing', label: 'WH40K.Difficulty.Punishing', value: -40 },
        { key: 'hellish', label: 'WH40K.Difficulty.Hellish', value: -50 },
        { key: 'infernal', label: 'WH40K.Difficulty.Infernal', value: -60 },
    ];

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    declare actor: Actor | null;
    declare config: RollConfig;
    declare selectedDifficulty: string;
    declare customModifier: number;
    declare activeSituationalModifiers: Set<string>;
    #resolve: ((value: unknown) => void) | null = null;

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {RollConfig} config - Roll configuration
     * @param {Object} [options] - Application options
     */
    constructor(config: RollConfig = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.config = foundry.utils.deepClone(config);
        this.actor = config.actor || null;
        this.selectedDifficulty = config.difficulty || 'difficult';
        this.customModifier = config.customModifier || 0;
        this.activeSituationalModifiers = new Set();
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context: unknown = await super._prepareContext(options);

        // Calculate the difficulty modifier
        const difficultyPreset = (this.constructor as any).DIFFICULTY_PRESETS.find((p: DifficultyPreset) => p.key === this.selectedDifficulty) || { value: 0 };
        const difficultyModifier = difficultyPreset.value;

        // Calculate situational modifier from active checkboxes
        const situationalModifierTotal = this._calculateSituationalTotal();

        // Prepare permanent modifiers (from items, conditions, etc.)
        const permanentModifiers = (this.config.permanentModifiers || []).map((mod: { uuid?: string; value: number }) => ({
            ...mod,
            valueDisplay: mod.value > 0 ? `+${mod.value}` : mod.value.toString(),
            hasSource: !!mod.uuid,
        }));
        const hasPermanentModifiers = permanentModifiers.length > 0;

        // Calculate permanent modifier total
        const permanentModifierTotal = permanentModifiers.reduce((sum: number, mod: { uuid?: string; value: number }) => sum + mod.value, 0);

        // Calculate total modifier and final target
        const totalModifier = difficultyModifier + this.customModifier + situationalModifierTotal + permanentModifierTotal;
        const baseTarget = this.config.target || 0;
        const finalTarget = Math.max(1, Math.min(100, baseTarget + totalModifier));

        // Prepare situational modifiers for display
        const situationalModifiers = (this.config.situationalModifiers || []).map((mod: { value: number }, index: number) => ({
            ...mod,
            id: `sit-${index}`,
            active: this.activeSituationalModifiers.has(`sit-${index}`),
            valueDisplay: mod.value > 0 ? `+${mod.value}` : mod.value.toString(),
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
            difficulties: (this.constructor as any).DIFFICULTY_PRESETS.map((d: DifficultyPreset) => ({
                ...d,
                label: game.i18n.localize(d.label),
                selected: d.key === this.selectedDifficulty,
                cssClass: d.value > 0 ? 'positive' : d.value < 0 ? 'negative' : 'neutral',
            })),
            selectedDifficulty: this.selectedDifficulty,

            // Roll modes - V13: rollModes values are objects with a label property
            rollModes: Object.entries(CONFIG.Dice.rollModes).map(([key, mode]: [string, any]) => ({
                key: key,
                label: game.i18n.localize(mode.label),
                selected: key === (this.config.rollMode || game.settings.get('core', 'rollMode')),
            })),

            // Form buttons
            buttons: [
                { type: 'submit', icon: 'fa-solid fa-dice-d20', label: 'WH40K.Roll.Roll', cssClass: 'primary' },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /**
     * Calculate the total from active situational modifiers.
     * @returns {number}
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _calculateSituationalTotal(): number {
        let total = 0;
        const situationalModifiers = this.config.situationalModifiers || [];
        for (let i = 0; i < situationalModifiers.length; i++) {
            if (this.activeSituationalModifiers.has(`sit-${i}`)) {
                total += situationalModifiers[i].value || 0;
            }
        }
        return total;
    }

    /** @foundry-v14-overrides.d.ts */
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

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
    #onCustomModifierChange(event: Event): void {
        const inputElement = event.currentTarget as HTMLInputElement;
        const stringValue = inputElement.value ?? "";
        this.customModifier = Number(stringValue) || 0;
        void this.render({ parts: ['form'] });
    }

    /**
     * Handle difficulty selection change
     * @param {Event} event
     */
    #onDifficultyChange(event: Event): void {
        this.selectedDifficulty = (event.currentTarget as HTMLSelectElement).value;
        void this.render({ parts: ['form'] });
    }

    /**
     * Cancel the dialog
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #cancel(this: any, event: Event, target: HTMLElement): void {
        // Note: 'this' is bound to the instance by ApplicationV2 action handler system
        this.close();
    }

    /**
     * View the source of a permanent modifier
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #viewModifierSource(this: any, event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        const item = await (fromUuid as any)(uuid);
        if (item) {
            // Check for Shift+Click to post to chat
            if ((event as MouseEvent).shiftKey) {
                item.toMessage();
            } else {
                // Default: open sheet
                item.sheet.render(true);
            }
        }
    }

    /**
     * Handle situational modifier toggle
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {RollConfigurationDialog}
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #toggleSituational(this: any, event: Event, target: HTMLElement): void {
        const modId = target.dataset.modifierId;
        if (this.activeSituationalModifiers.has(modId)) {
            this.activeSituationalModifiers.delete(modId);
        } else {
            this.activeSituationalModifiers.add(modId);
        }
        this.render({ parts: ['form'] });
    }

    /**
     * Handle form submission
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static #onSubmit(this: RollConfigurationDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): void {
        const data = formData.object;

        const difficultyPreset = RollConfigurationDialog.DIFFICULTY_PRESETS.find((p) => p.key === data.difficulty) || { value: 0 };
        const situationalTotal = this._calculateSituationalTotal();
        const customModifier = Number(data.customModifier as string) || 0;

        const result: RollConfig = {
            ...this.config,
            difficulty: data.difficulty as string,
            difficultyModifier: difficultyPreset.value,
            customModifier: customModifier,
            situationalModifier: situationalTotal,
            rollMode: data.rollMode as string,
            target: (this.config.target ?? 0) + difficultyPreset.value + customModifier + situationalTotal,
            baseTarget: this.config.target ?? 0,
            modifiers: {
                ...(this.config.modifiers ?? {}),
                difficulty: difficultyPreset.value,
                custom: customModifier,
                situational: situationalTotal,
            },
        };

        if (this.#resolve) {
            this.#resolve(result);
        }
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Show the dialog and wait for result
     * @returns {Promise<Object|null>} The configuration result, or null if cancelled
     */
    async wait(): Promise<unknown> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /** @foundry-v14-overrides.d.ts */
    async close(options: Record<string, unknown> = {}): Promise<void> {
        // Ensure we resolve with null if closed without submitting
        if (this.#resolve && !(options as any).submitted) {
            this.#resolve(null);
        }
        await super.close(options);
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Create and show a roll configuration dialog
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object|null>} Configuration result or null if cancelled
     */
    static async configure(config: Record<string, unknown> = {}): Promise<unknown> {
        const dialog = new this(config);
        return dialog.wait();
    }
}
