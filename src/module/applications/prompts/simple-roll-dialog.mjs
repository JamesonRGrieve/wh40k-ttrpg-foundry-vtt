/**
 * @file SimpleRollDialog - V2 dialog for simple skill/characteristic rolls
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import { sendActionDataToChat } from "../../rolls/roll-helpers.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for configuring simple skill or characteristic rolls.
 */
export default class SimpleRollDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {object} simpleSkillData  The skill data.
     * @param {object} [options={}]     Dialog options.
     */
    constructor(simpleSkillData = {}, options = {}) {
        super(options);
        this.simpleSkillData = simpleSkillData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["rogue-trader", "dialog", "simple-roll", "standard-form"],
        actions: {
            roll: SimpleRollDialog.#onRoll,
            cancel: SimpleRollDialog.#onCancel
        },
        position: {
            width: 300
        },
        window: {
            title: "Roll Modifier",
            minimizable: false
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/simple-roll-prompt.hbs",
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The skill data.
     * @type {object}
     */
    simpleSkillData;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return {
            ...context,
            ...this.simpleSkillData
        };
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]')
            .forEach(input => {
                input.addEventListener("focus", (event) => {
                    event.target.select();
                });
            });

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
     * @this {SimpleRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRoll(event, target) {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {SimpleRollDialog}
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
     * Perform the simple roll.
     * @protected
     */
    async _performRoll() {
        const form = this.element.querySelector("form") ?? this.element;
        const rollData = this.simpleSkillData.rollData;

        // Get form values
        const difficultySelect = form.querySelector("#difficulty");
        const modifierInput = form.querySelector("#modifier");

        rollData.modifiers["difficulty"] = parseInt(difficultySelect?.value ?? 0);
        rollData.modifiers["modifier"] = modifierInput?.value ?? 0;

        await rollData.calculateTotalModifiers();
        await this.simpleSkillData.calculateSuccessOrFailure();
        await sendActionDataToChat(this.simpleSkillData);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a simple roll dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export async function prepareSimpleRoll(simpleSkillData) {
    const prompt = new SimpleRollDialog(simpleSkillData);
    prompt.render(true);
}
