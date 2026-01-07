/**
 * @file PsychicPowerDialog - V2 dialog for psychic power configuration
 */

import BaseRollDialog from "./base-roll-dialog.mjs";

/**
 * Dialog for configuring psychic power uses.
 */
export default class PsychicPowerDialog extends BaseRollDialog {
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
        classes: ["psychic-power"],
        actions: {
            selectPower: PsychicPowerDialog.#onSelectPower
        },
        window: {
            title: "Psychic Power"
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/psychic-power-roll-prompt.hbs",
            scrollable: [""]
        }
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
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up power selection listeners
        this.element.querySelectorAll(".power-select").forEach(el => {
            el.addEventListener("change", this._onPowerSelectChange.bind(this));
        });

        // Set up button listeners
        this.element.querySelector("#power-roll")?.addEventListener("click", this._onPowerRoll.bind(this));
        this.element.querySelector("#power-cancel")?.addEventListener("click", this._onPowerCancel.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle power selection change.
     * @param {Event} event  The change event.
     * @protected
     */
    async _onPowerSelectChange(event) {
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
    async _onPowerRoll(event) {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle power cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPowerCancel(event) {
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
    static async #onSelectPower(event, target) {
        this.rollData.selectPower(target.name);
        await this.rollData.update();
        this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll() {
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
