import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Base dialog class for roll prompts.
 * Provides common functionality for weapon, psychic, force field, and other roll dialogs.
 */
export default class BaseRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {Record<string, unknown>} rollData     The roll data to configure.
     * @param {ApplicationV2Config.DefaultOptions} [options={}] Dialog options.
     */
    constructor(rollData: Record<string, unknown> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.rollData = rollData;
        this.initialized = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'roll-dialog', 'standard-form'],
        actions: {
            roll: BaseRollDialog.#onRoll as unknown as ApplicationV2Config.DefaultOptions['actions'],
            cancel: BaseRollDialog.#onCancel as unknown as ApplicationV2Config.DefaultOptions['actions'],
        },
        form: {
            handler: BaseRollDialog.#onFormSubmit as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: {
            width: 500,
        },
        window: {
            minimizable: false,
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/base-roll-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The roll data being configured.
     * @type {object}
     */
    rollData;

    /**
     * Whether the dialog has been initialized.
     * @type {boolean}
     */
    initialized;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Initialize roll data on first render
        if (!this.initialized && typeof this.rollData.initialize === 'function') {
            (this.rollData.initialize as () => void)();
            this.initialized = true;
        }

        // Update roll data if it has an update method
        if (typeof this.rollData.update === 'function') {
            await (this.rollData.update as () => Promise<void>)();
        }

        const context = (await super._prepareContext(options)) as Record<string, unknown>;
        return {
            ...context,
            ...this.rollData,
            rollData: this.rollData,
            dh: CONFIG.wh40k,
            isEditable: true,
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        setupNumberInputAutoSelect(this.element);
    }

    /* -------------------------------------------- */
    /*  Form Handling                               */
    /* -------------------------------------------- */

    /**
     * Handle form submission - updates roll data with form values.
     * @param {SubmitEvent} event           The form submission event.
     * @param {HTMLFormElement} form  The form element.
     * @param {FormDataExtended} formData  The form data.
     */
    static async #onFormSubmit(this: BaseRollDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = foundry.utils.expandObject(formData.object);
        this._updateRollData(data);

        if (typeof this.rollData.update === 'function') {
            await (this.rollData.update as () => Promise<void>)();
        }
    }

    /* -------------------------------------------- */

    /**
     * Update roll data from form values. Override in subclasses for custom handling.
     * @param {object} formData  The expanded form data.
     * @protected
     */
    _updateRollData(formData: Record<string, unknown>): void {
        foundry.utils.mergeObject(this.rollData, formData, { recursive: true });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     * @this {BaseRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRoll(this: BaseRollDialog, event: Event, target: HTMLElement): Promise<void> {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {BaseRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(this: BaseRollDialog, event: Event, target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Perform the roll action. Override in subclasses.
     * @protected
     */
    async _performRoll(): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Validate roll can be performed. Override in subclasses.
     * @returns {boolean}
     * @protected
     */
    _validateRoll(): boolean {
        return true;
    }
}
