/**
 * @file ForceFieldDialog - V2 dialog for force field rolls
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring force field rolls.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 options type; callers pass unknown option shapes
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
    };

    /* -------------------------------------------- */

    /** @override */
    override get title(): string {
        return game.i18n.localize('WH40K.Roll.ForceFieldTitle');
    }

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onRender context and options are untyped Foundry framework parameters
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Set up button listeners
        this.element.querySelector('#roll-force-field')?.addEventListener('click', (e) => void this._onRollForceField(e));
        this.element.querySelector('#cancel-prompt')?.addEventListener('click', (e) => void this._onCancelPrompt(e));
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
        if (ff?.system?.activated !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.Roll.ForceFieldNotActivated'));
            return false;
        }

        if (ff.system.overloaded === true) {
            ui.notifications.warn(game.i18n.localize('WH40K.Roll.ForceFieldOverloaded'));
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
// eslint-disable-next-line no-restricted-syntax -- boundary: forceFieldData is passed from the item document roll API; caller knows concrete shape but this API accepts any compatible object
export function prepareForceFieldRoll(forceFieldData: Record<string, unknown>): void {
    const prompt = new ForceFieldDialog(forceFieldData);
    void prompt.render({ force: true });
}
