/**
 * @file BaseRollDialog - Base class for roll configuration dialogs
 * Based on dnd5e's RollConfigurationDialog pattern for Foundry V13+
 */

import ApplicationV2Mixin from '../api/application-v2-mixin.mjs';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Base dialog class for roll prompts.
 * Provides common functionality for weapon, psychic, force field, and other roll dialogs.
 */
export default class BaseRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {object} rollData     The roll data to configure.
     * @param {object} [options={}] Dialog options.
     */
    constructor(rollData = {}, options = {}) {
        super(options);
        this.rollData = rollData;
        this.initialized = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['rogue-trader', 'dialog', 'roll-dialog', 'standard-form'],
        actions: {
            roll: this.#onRoll,
            cancel: this.#onCancel,
        },
        form: {
            handler: this.#onFormSubmit,
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
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/prompt/base-roll-prompt.hbs',
            scrollable: [''],
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
    async _prepareContext(options) {
        // Initialize roll data on first render
        if (!this.initialized && this.rollData.initialize) {
            this.rollData.initialize();
            this.initialized = true;
        }

        // Update roll data if it has an update method
        if (this.rollData.update) {
            await this.rollData.update();
        }

        const context = await super._prepareContext(options);
        return {
            ...context,
            ...this.rollData,
            rollData: this.rollData,
            dh: CONFIG.rt,
            isEditable: true,
        };
    }

    /* -------------------------------------------- */
    /*  Form Handling                               */
    /* -------------------------------------------- */

    /**
     * Handle form submission - updates roll data with form values.
     * @this {BaseRollDialog}
     * @param {Event} event           The form submission event.
     * @param {HTMLFormElement} form  The form element.
     * @param {FormDataExtended} formData  The form data.
     */
    static async #onFormSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        this._updateRollData(data);

        if (this.rollData.update) {
            await this.rollData.update();
        }
    }

    /* -------------------------------------------- */

    /**
     * Update roll data from form values. Override in subclasses for custom handling.
     * @param {object} formData  The expanded form data.
     * @protected
     */
    _updateRollData(formData) {
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
    static async #onRoll(event, target) {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {BaseRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(event, target) {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Perform the roll action. Override in subclasses.
     * @protected
     */
    async _performRoll() {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Validate roll can be performed. Override in subclasses.
     * @returns {boolean}
     * @protected
     */
    _validateRoll() {
        return true;
    }
}
