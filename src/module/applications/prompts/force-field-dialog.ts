/**
 * @file ForceFieldDialog - V2 dialog for force field rolls
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
    constructor(forceFieldData = {}, options: ForceFieldDialogOptions = {}) {
        super(forceFieldData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['force-field'],
        window: {
            title: 'Force Field',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/force-field-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
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

    /** @override */
    override _validateRoll(): boolean {
        const ff = this.rollData['forceField'] as { system?: { activated?: boolean; overloaded?: boolean } } | null | undefined;
        if (!ff?.system?.activated) {
            ui.notifications.warn('Force Field not activated!');
            return false;
        }

        if (ff?.system?.overloaded) {
            ui.notifications.warn('Force Field currently overloaded!');
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    override async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        await (this.rollData['finalize'] as () => Promise<void>)();
        await (this.rollData['performActionAndSendToChat'] as () => Promise<void>)();
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
