/**
 * @gulpfile.js ForceFieldDialog - V2 dialog for force field rolls
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring force field rolls.
 */
type ForceFieldDialogOptions = Record<string, unknown>;

export default class ForceFieldDialog extends BaseRollDialog {
    /**
     * @param {object} forceFieldData  The force field data.
     * @param {ForceFieldDialogOptions} [options={}]    Dialog options.
     */
    constructor(forceFieldData: Record<string, unknown> = {}, options: ForceFieldDialogOptions = {}) {
        super(forceFieldData, options);
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS = {
        classes: ['force-field'],
        window: {
            title: 'Force Field',
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/force-field-prompt.hbs',
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
        this.element.querySelector('#roll-force-field')?.addEventListener('click', this._onRollForceField.bind(this));
        this.element.querySelector('#cancel-prompt')?.addEventListener('click', this._onCancelPrompt.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle force field roll button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onRollForceField(event: Event): Promise<void> {
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

    /** @foundry-v14-overrides.d.ts */
    _validateRoll(): boolean {
        if (!(this.rollData.forceField as Record<string, unknown>)?.system?.activated) {
            ui.notifications.warn('Force Field not activated!');
            return false;
        }

        if ((this.rollData.forceField as Record<string, unknown>)?.system?.overloaded) {
            ui.notifications.warn('Force Field currently overloaded!');
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        await (this.rollData as Record<string, unknown>).finalize();
        await (this.rollData as Record<string, unknown>).performActionAndSendToChat();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a force field dialog.
 * @param {object} forceFieldData  The force field data.
 */
export function prepareForceFieldRoll(forceFieldData: Record<string, unknown>) {
    const prompt = new ForceFieldDialog(forceFieldData);
    prompt.render(true);
}
