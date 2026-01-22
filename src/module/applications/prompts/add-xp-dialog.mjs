/**
 * @file AddXPDialog - V2 dialog for adding/subtracting XP
 */

import ApplicationV2Mixin from '../api/application-v2-mixin.mjs';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for adding or subtracting experience points.
 */
export default class AddXPDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {RogueTraderAcolyte} actor  The actor to modify.
     * @param {object} [options={}]       Dialog options.
     */
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.xpAmount = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['rogue-trader', 'dialog', 'add-xp-dialog', 'standard-form'],
        actions: {
            apply: this.#onApply,
            cancel: this.#onCancel,
        },
        form: {
            handler: this.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: {
            width: 400,
        },
        window: {
            title: 'Adjust Total XP',
            minimizable: false,
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/prompt/add-xp-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor being modified.
     * @type {RogueTraderAcolyte}
     */
    actor;

    /**
     * The XP amount to add/subtract.
     * @type {number}
     */
    xpAmount;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const currentTotal = this.actor.system?.experience?.total ?? 0;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        return {
            ...context,
            actor: this.actor,
            currentTotal,
            xpAmount: this.xpAmount,
            newTotal,
            isAddition: this.xpAmount >= 0,
            absAmount: Math.abs(this.xpAmount),
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Auto-select and focus the input field
        const input = this.element.querySelector('input[name="xpAmount"]');
        if (input) {
            input.focus();
            input.select();

            // Auto-select on focus for easy editing
            input.addEventListener('focus', (event) => {
                event.target.select();
            });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle form changes to update preview.
     * @this {AddXPDialog}
     * @param {Event} event         Triggering change event.
     * @param {HTMLElement} form    The form element.
     * @param {FormDataExtended} formData  The form data.
     */
    static async #onFormChange(event, form, formData) {
        const xpAmount = parseInt(formData.object.xpAmount) || 0;
        if (this.xpAmount !== xpAmount) {
            this.xpAmount = xpAmount;
            await this.render();
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle apply button click.
     * @this {AddXPDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onApply(event, target) {
        event.preventDefault();

        if (this.xpAmount === 0) {
            await this.close();
            return;
        }

        const currentTotal = this.actor.system?.experience?.total ?? 0;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        await this.actor.update({ 'system.experience.total': newTotal });

        const verb = this.xpAmount > 0 ? 'added' : 'removed';
        ui.notifications.info(`${Math.abs(this.xpAmount)} XP ${verb}. Total: ${newTotal}`);

        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {AddXPDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(event, target) {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open an add XP dialog.
 * @param {RogueTraderAcolyte} actor  The actor to modify.
 */
export async function openAddXPDialog(actor) {
    const dialog = new AddXPDialog(actor);
    dialog.render(true);
}
