/**
 * @file AssignDamageDialog - V2 dialog for damage assignment
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for assigning damage to a target.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class AssignDamageDialog extends BaseRollDialog {
    [key: string]: any;
    /**
     * @param {object} assignDamageData  The damage assignment data.
     * @param {object} [options={}]      Dialog options.
     */
    constructor(assignDamageData = {}, options = {}) {
        super(assignDamageData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['assign-damage'],
        window: {
            title: 'Assign Damage',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/assign-damage-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Set up button listeners
        this.element.querySelector('#assign-damage')?.addEventListener('click', this._onAssignDamage.bind(this));
        this.element.querySelector('#cancel-prompt')?.addEventListener('click', this._onCancelPrompt.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle assign damage button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onAssignDamage(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onCancelPrompt(event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        await this.rollData.finalize();
        await this.rollData.performActionAndSendToChat();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open an assign damage dialog.
 * @param {object} assignDamageData  The damage assignment data.
 */
export function prepareAssignDamageRoll(assignDamageData) {
    const prompt = new AssignDamageDialog(assignDamageData);
    prompt.render(true);
}
