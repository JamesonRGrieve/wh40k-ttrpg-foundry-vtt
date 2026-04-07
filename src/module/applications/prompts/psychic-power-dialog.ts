/**
 * @file PsychicPowerDialog - V2 dialog for psychic power configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring psychic power uses.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class PsychicPowerDialog extends BaseRollDialog {
    [key: string]: any;
    /**
     * @param {PsychicActionData} psychicActionData  The psychic action data.
     * @param {object} [options={}]                  Dialog options.
     */
    constructor(psychicActionData = {}, options = {}) {
        super(psychicActionData.rollData, options);
        this.psychicAttackData = psychicActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['psychic-power'],
        actions: {
            selectPower: PsychicPowerDialog.#onSelectPower,
        },
        window: {
            title: 'Psychic Power',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/psychic-power-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The psychic action data.
     * @type {PsychicActionData}
     */
    psychicAttackData;

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                event.target.select();
            });
        });

        // Set up power selection listeners
        this.element.querySelectorAll('.power-select').forEach((el) => {
            el.addEventListener('change', this._onPowerSelectChange.bind(this));
        });

        // Set up button listeners
        this.element.querySelector('#power-roll')?.addEventListener('click', this._onPowerRoll.bind(this));
        this.element.querySelector('#power-cancel')?.addEventListener('click', this._onPowerCancel.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle power selection change.
     * @param {Event} event  The change event.
     * @protected
     */
    async _onPowerSelectChange(event: Event): Promise<void> {
        this.rollData.selectPower(event.target.name);
        await this.rollData.update();
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle power roll button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPowerRoll(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle power cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPowerCancel(event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle power selection via action.
     * @this {PsychicPowerDialog}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the action.
     */
    static async #onSelectPower(this: any, event: Event, target: HTMLElement): Promise<void> {
        this.rollData.selectPower(target.name);
        await this.rollData.update();
        this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        await this.rollData.finalize();
        await this.psychicAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a psychic power dialog.
 * @param {PsychicActionData} psychicAttackData  The psychic action data.
 */
export async function preparePsychicPowerRoll(psychicAttackData) {
    const prompt = new PsychicPowerDialog(psychicAttackData);
    prompt.render(true);
}
