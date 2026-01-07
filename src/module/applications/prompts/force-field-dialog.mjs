/**
 * @file ForceFieldDialog - V2 dialog for force field rolls
 */

import BaseRollDialog from "./base-roll-dialog.mjs";

/**
 * Dialog for configuring force field rolls.
 */
export default class ForceFieldDialog extends BaseRollDialog {
    /**
     * @param {object} forceFieldData  The force field data.
     * @param {object} [options={}]    Dialog options.
     */
    constructor(forceFieldData = {}, options = {}) {
        super(forceFieldData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["force-field"],
        window: {
            title: "Force Field"
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/force-field-prompt.hbs",
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up button listeners
        this.element.querySelector("#roll-force-field")?.addEventListener("click", this._onRollForceField.bind(this));
        this.element.querySelector("#cancel-prompt")?.addEventListener("click", this._onCancelPrompt.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle force field roll button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onRollForceField(event) {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onCancelPrompt(event) {
        event.preventDefault();
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    _validateRoll() {
        if (!this.rollData.forceField?.system?.activated) {
            ui.notifications.warn("Force Field not activated!");
            return false;
        }

        if (this.rollData.forceField?.system?.overloaded) {
            ui.notifications.warn("Force Field currently overloaded!");
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    async _performRoll() {
        if (!this._validateRoll()) return;

        await this.rollData.finalize();
        await this.rollData.performActionAndSendToChat();
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
export async function prepareForceFieldRoll(forceFieldData) {
    const prompt = new ForceFieldDialog(forceFieldData);
    prompt.render(true);
}
