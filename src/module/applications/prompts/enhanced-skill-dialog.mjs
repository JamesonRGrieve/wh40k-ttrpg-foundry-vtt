/**
 * @file EnhancedSkillDialog - Enhanced V2 dialog for skill/characteristic rolls
 * Showcase feature demonstrating ApplicationV2 capabilities with:
 * - Visual difficulty presets with icons
 * - Common modifier checkboxes
 * - Live target calculation
 * - Recent rolls memory
 * - Animated feedback
 */

import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import { sendActionDataToChat } from "../../rolls/roll-helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Enhanced dialog for configuring skill or characteristic rolls.
 */
export default class EnhancedSkillDialog extends ApplicationV2Mixin(HandlebarsApplicationMixin(ApplicationV2)) {
    /**
     * @param {object} simpleSkillData  The skill data.
     * @param {object} [options={}]     Dialog options.
     */
    constructor(simpleSkillData = {}, options = {}) {
        super(options);
        this.simpleSkillData = simpleSkillData;
        this._selectedDifficulty = 0; // Challenging (baseline)
        this._commonModifiers = {};
        this._customModifier = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["rogue-trader", "dialog", "enhanced-skill-roll", "standard-form"],
        actions: {
            selectDifficulty: EnhancedSkillDialog.#onSelectDifficulty,
            toggleModifier: EnhancedSkillDialog.#onToggleModifier,
            updateCustom: EnhancedSkillDialog.#onUpdateCustom,
            roll: EnhancedSkillDialog.#onRoll,
            rollRepeat: EnhancedSkillDialog.#onRollRepeat,
            cancel: EnhancedSkillDialog.#onCancel
        },
        form: {
            submitOnChange: false,
            closeOnSubmit: false
        },
        position: {
            width: 450,
            height: "auto"
        },
        window: {
            title: "Skill Test",
            minimizable: false
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/prompt/enhanced-skill-roll.hbs"
        }
    };

    /* -------------------------------------------- */
    /*  Difficulty Presets                          */
    /* -------------------------------------------- */

    /**
     * Difficulty preset configurations.
     * @type {Array<{key: string, label: string, modifier: number, icon: string, description: string}>}
     */
    static DIFFICULTIES = [
        {
            key: "trivial",
            label: "Trivial",
            modifier: 60,
            icon: "fa-smile",
            description: "Automatic success unless complications"
        },
        {
            key: "easy",
            label: "Easy",
            modifier: 30,
            icon: "fa-grin",
            description: "Simple tasks with no pressure"
        },
        {
            key: "routine",
            label: "Routine",
            modifier: 20,
            icon: "fa-meh",
            description: "Standard tasks with time"
        },
        {
            key: "ordinary",
            label: "Ordinary",
            modifier: 10,
            icon: "fa-smile-beam",
            description: "Typical difficulty"
        },
        {
            key: "challenging",
            label: "Challenging",
            modifier: 0,
            icon: "fa-grimace",
            description: "No modifier (baseline)",
            default: true
        },
        {
            key: "difficult",
            label: "Difficult",
            modifier: -10,
            icon: "fa-frown",
            description: "Complex or contested tasks"
        },
        {
            key: "hard",
            label: "Hard",
            modifier: -20,
            icon: "fa-dizzy",
            description: "Very challenging circumstances"
        },
        {
            key: "veryHard",
            label: "Very Hard",
            modifier: -30,
            icon: "fa-tired",
            description: "Exceptional difficulty"
        },
        {
            key: "hellish",
            label: "Hellish",
            modifier: -60,
            icon: "fa-skull",
            description: "Near-impossible feats"
        }
    ];

    /* -------------------------------------------- */

    /**
     * Common modifier presets.
     * @type {Array<{key: string, label: string, value: number, description: string}>}
     */
    static COMMON_MODIFIERS = [
        {
            key: "goodTools",
            label: "Good Tools",
            value: 10,
            description: "Quality equipment aids the task"
        },
        {
            key: "poorTools",
            label: "Poor Tools",
            value: -10,
            description: "Inadequate or damaged equipment"
        },
        {
            key: "rushed",
            label: "Rushed",
            value: -10,
            description: "Insufficient time to work carefully"
        },
        {
            key: "extraTime",
            label: "Extra Time",
            value: 10,
            description: "Taking time to work methodically"
        },
        {
            key: "assistance",
            label: "Assistance",
            value: 10,
            description: "+10 per helper (max +30)"
        }
    ];

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The skill data.
     * @type {object}
     */
    simpleSkillData;

    /**
     * Currently selected difficulty modifier.
     * @type {number}
     * @private
     */
    _selectedDifficulty = 0;

    /**
     * Active common modifiers.
     * @type {Record<string, boolean>}
     * @private
     */
    _commonModifiers = {};

    /**
     * Custom modifier value.
     * @type {number}
     * @private
     */
    _customModifier = 0;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const rollData = this.simpleSkillData.rollData;

        // Calculate total modifier
        const difficultyMod = this._selectedDifficulty;
        const commonMod = this._calculateCommonModifiers();
        const customMod = this._customModifier;
        const totalModifier = difficultyMod + commonMod + customMod;

        // Prepare difficulty buttons
        const difficulties = this.constructor.DIFFICULTIES.map(d => ({
            ...d,
            selected: d.modifier === this._selectedDifficulty,
            cssClass: d.modifier === this._selectedDifficulty ? "selected" : ""
        }));

        // Prepare common modifiers
        const commonModifiers = this.constructor.COMMON_MODIFIERS.map(m => ({
            ...m,
            checked: this._commonModifiers[m.key] || false
        }));

        // Get recent rolls from user flags
        const recentRolls = this._getRecentRolls();

        return {
            ...context,
            skillName: this.simpleSkillData.name || rollData?.name || "Test",
            baseTarget: rollData?.baseTarget || 0,
            finalTarget: (rollData?.baseTarget || 0) + totalModifier,
            difficulties,
            commonModifiers,
            customModifier: this._customModifier,
            totalModifier,
            difficultyMod,
            commonMod,
            recentRolls,
            hasRecentRolls: recentRolls.length > 0
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Focus custom modifier input
        this.element.querySelector("#customModifier")?.addEventListener("input", (e) => {
            this._customModifier = parseInt(e.target.value) || 0;
            this.render(false, { parts: ["form"] });
        });

        // Add keyboard shortcut (Enter to roll)
        this.element.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this._performRoll();
            }
        });
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Calculate total from common modifiers.
     * @returns {number}
     * @private
     */
    _calculateCommonModifiers() {
        let total = 0;
        for (const [key, active] of Object.entries(this._commonModifiers)) {
            if (!active) continue;
            const modifier = this.constructor.COMMON_MODIFIERS.find(m => m.key === key);
            if (modifier) total += modifier.value;
        }
        return total;
    }

    /* -------------------------------------------- */

    /**
     * Get recent rolls from user flags.
     * @returns {Array<{name: string, modifier: number, timestamp: number}>}
     * @private
     */
    _getRecentRolls() {
        const recent = game.user.getFlag("rogue-trader", "recentRolls") || [];
        return recent.slice(0, 3); // Last 3 rolls
    }

    /* -------------------------------------------- */

    /**
     * Save this roll to recent rolls.
     * @param {number} modifier  Total modifier used.
     * @private
     */
    async _saveToRecentRolls(modifier) {
        const recent = game.user.getFlag("rogue-trader", "recentRolls") || [];
        recent.unshift({
            name: this.simpleSkillData.name || "Test",
            modifier,
            timestamp: Date.now()
        });

        // Keep only last 10
        const trimmed = recent.slice(0, 10);
        await game.user.setFlag("rogue-trader", "recentRolls", trimmed);
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle difficulty button click.
     * @this {EnhancedSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onSelectDifficulty(event, target) {
        const modifier = parseInt(target.dataset.modifier);
        this._selectedDifficulty = modifier;

        // Animate selection
        target.classList.add("flash-select");
        setTimeout(() => target.classList.remove("flash-select"), 300);

        await this.render(false, { parts: ["form"] });
    }

    /* -------------------------------------------- */

    /**
     * Handle common modifier checkbox toggle.
     * @this {EnhancedSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Checkbox that was clicked.
     */
    static async #onToggleModifier(event, target) {
        const key = target.dataset.modifierKey;
        this._commonModifiers[key] = target.checked;
        await this.render(false, { parts: ["form"] });
    }

    /* -------------------------------------------- */

    /**
     * Handle custom modifier input change.
     * @this {EnhancedSkillDialog}
     * @param {Event} event         Triggering input event.
     * @param {HTMLElement} target  Input that was changed.
     */
    static async #onUpdateCustom(event, target) {
        this._customModifier = parseInt(target.value) || 0;
        await this.render(false, { parts: ["form"] });
    }

    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     * @this {EnhancedSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRoll(event, target) {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle repeat last roll button click.
     * @this {EnhancedSkillDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRollRepeat(event, target) {
        const modifier = parseInt(target.dataset.modifier);

        // Apply the modifier directly
        this._customModifier = modifier - this._selectedDifficulty;

        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {EnhancedSkillDialog}
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
     * Perform the skill roll.
     * @protected
     */
    async _performRoll() {
        const rollData = this.simpleSkillData.rollData;

        // Calculate total modifier
        const totalModifier = this._selectedDifficulty + this._calculateCommonModifiers() + this._customModifier;

        // Apply to roll data
        rollData.modifiers["difficulty"] = this._selectedDifficulty;
        rollData.modifiers["common"] = this._calculateCommonModifiers();
        rollData.modifiers["modifier"] = this._customModifier;

        // Save to recent rolls
        await this._saveToRecentRolls(totalModifier);

        // Execute roll
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
 * Open an enhanced skill roll dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export async function prepareEnhancedSkillRoll(simpleSkillData) {
    const prompt = new EnhancedSkillDialog(simpleSkillData);
    prompt.render(true);
}
