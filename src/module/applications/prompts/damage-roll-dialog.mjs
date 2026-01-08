/**
 * @file DamageRollDialog - V2 dialog for damage rolls
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import { sendActionDataToChat } from "../../rolls/roll-helpers.mjs";
import { ActionData } from "../../rolls/action-data.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for configuring damage rolls.
 */
export default class DamageRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {object} rollData      The roll data.
     * @param {object} [options={}]  Dialog options.
     */
    constructor(rollData = {}, options = {}) {
        super(options);
        this.rollData = rollData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["rogue-trader", "dialog", "damage-roll", "standard-form"],
        actions: {
            roll: DamageRollDialog.#onRoll,
            cancel: DamageRollDialog.#onCancel
        },
        position: {
            width: 300
        },
        window: {
            title: "Damage Roll",
            minimizable: false
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/damage-roll-prompt.hbs",
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The roll data.
     * @type {object}
     */
    rollData;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return {
            ...context,
            ...this.rollData,
            dh: CONFIG.rt
        };
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up button listeners for V1-style templates
        this.element.querySelector("[data-action='roll']")?.addEventListener("click", (e) => {
            e.preventDefault();
            this._performRoll();
        });
        this.element.querySelector("[data-action='cancel']")?.addEventListener("click", (e) => {
            e.preventDefault();
            this.close();
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     * @this {DamageRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRoll(event, target) {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {DamageRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(event, target) {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /**
     * Perform the damage roll.
     * @protected
     */
    async _performRoll() {
        const form = this.element.querySelector("form") ?? this.element;
        
        const actionData = new ActionData();
        actionData.template = "systems/rogue-trader/templates/chat/damage-roll-chat.hbs";

        // Get form values
        this.rollData.damage = form.querySelector("#damage")?.value ?? this.rollData.damage;
        this.rollData.penetration = form.querySelector("#penetration")?.value ?? this.rollData.penetration;
        this.rollData.damageType = form.querySelector("[name=damageType]")?.value ?? this.rollData.damageType;
        this.rollData.pr = form.querySelector("#pr")?.value;
        this.rollData.template = "systems/rogue-trader/templates/chat/damage-roll-chat.hbs";

        // Perform the roll
        this.rollData.roll = new Roll(this.rollData.damage, this.rollData);
        await this.rollData.roll.evaluate();

        actionData.rollData = this.rollData;
        await sendActionDataToChat(actionData);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a damage roll dialog.
 * @param {object} rollData  The roll data.
 */
export async function prepareDamageRoll(rollData) {
    rollData.dh = CONFIG.rt;
    const prompt = new DamageRollDialog(rollData);
    prompt.render(true);
}
