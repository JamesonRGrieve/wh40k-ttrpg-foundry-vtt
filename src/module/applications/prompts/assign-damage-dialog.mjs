/**
 * @file AssignDamageDialog - V2 dialog for damage assignment
 */

import BaseRollDialog from "./base-roll-dialog.mjs";

/**
 * Dialog for assigning damage to a target.
 */
export default class AssignDamageDialog extends BaseRollDialog {
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
        classes: ["assign-damage"],
        window: {
            title: "Assign Damage"
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/assign-damage-prompt.hbs",
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
        this.element.querySelector("#assign-damage")?.addEventListener("click", this._onAssignDamage.bind(this));
        this.element.querySelector("#cancel-prompt")?.addEventListener("click", this._onCancelPrompt.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle assign damage button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onAssignDamage(event) {
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
    async _performRoll() {
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
export async function prepareAssignDamageRoll(assignDamageData) {
    const prompt = new AssignDamageDialog(assignDamageData);
    prompt.render(true);
}
