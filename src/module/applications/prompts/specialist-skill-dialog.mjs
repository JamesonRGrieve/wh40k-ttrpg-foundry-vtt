/**
 * @file SpecialistSkillDialog - V2 dialog for adding specialist skills
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Dialog for adding specialist skill specializations.
 */
export default class SpecialistSkillDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {object} simpleSkillData  The skill data.
     * @param {object} [options={}]     Dialog options.
     */
    constructor(simpleSkillData = {}, options = {}) {
        super(options);
        this.simpleSkillData = simpleSkillData;
        this.specializations = [];
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["rogue-trader", "dialog", "specialist-skill", "standard-form"],
        actions: {
            add: SpecialistSkillDialog.#onAdd,
            cancel: SpecialistSkillDialog.#onCancel
        },
        position: {
            width: 400
        },
        window: {
            title: "Create Specialist Skill",
            minimizable: false
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/add-speciality-prompt.hbs",
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

    /**
     * Available specializations from compendium.
     * @type {string[]}
     */
    specializations;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        // Load specializations from compendium on first render
        if (this.specializations.length === 0) {
            await this._loadSpecializations();
        }

        const context = await super._prepareContext(options);
        return {
            ...context,
            ...this.simpleSkillData,
            specializations: this.specializations
        };
    }

    /* -------------------------------------------- */

    /**
     * Load specializations from the skills compendium.
     * @protected
     */
    async _loadSpecializations() {
        const skillsCompendium = game.packs.get("rogue-trader.rt-items-skills");
        if (!skillsCompendium) return;

        // Find the skill in the compendium by matching the label
        const index = await skillsCompendium.getIndex();
        const skillEntries = index.filter(entry => entry.name.includes("(X)"));

        const skillLabel = this.simpleSkillData.skill?.label;
        if (!skillLabel) return;

        const skillEntry = skillEntries.find(entry => {
            const baseName = entry.name.replace(/\s*\(X\)\s*$/i, "").trim();
            return baseName.toLowerCase() === skillLabel.toLowerCase();
        });

        if (skillEntry) {
            const skillDoc = await skillsCompendium.getDocument(skillEntry._id);
            if (skillDoc?.system?.specializations) {
                this.specializations = skillDoc.system.specializations;
                this.simpleSkillData.specializations = this.specializations;
            }
        }
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
        this.element.querySelector("[data-action='add']")?.addEventListener("click", (e) => {
            e.preventDefault();
            this._addSpecialization();
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
     * Handle add button click.
     * @this {SpecialistSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onAdd(event, target) {
        await this._addSpecialization();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {SpecialistSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(event, target) {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Specialization Methods                      */
    /* -------------------------------------------- */

    /**
     * Add the specialization to the actor.
     * @protected
     */
    async _addSpecialization() {
        const form = this.element.querySelector("form") ?? this.element;
        
        let speciality = "";
        const dropdownElement = form.querySelector("#speciality-name");
        const customElement = form.querySelector("#custom-speciality-name");

        if (dropdownElement && dropdownElement.tagName === "SELECT") {
            // We have a dropdown with specializations
            const selectedValue = dropdownElement.value?.trim() ?? "";
            const customValue = customElement?.value?.trim() ?? "";

            // Prioritize custom input if provided
            if (customValue !== "") {
                speciality = customValue;
            } else if (selectedValue !== "") {
                speciality = selectedValue;
            }
        } else if (dropdownElement) {
            // Just a text input
            speciality = dropdownElement.value?.trim() ?? "";
        }

        if (!speciality) {
            ui.notifications.warn("Please enter or select a specialization name");
            return;
        }

        await this.simpleSkillData.actor.addSpecialitySkill(this.simpleSkillData.skillName, speciality);
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a specialist skill dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export async function prepareCreateSpecialistSkillPrompt(simpleSkillData) {
    const prompt = new SpecialistSkillDialog(simpleSkillData);
    prompt.render(true);
}
