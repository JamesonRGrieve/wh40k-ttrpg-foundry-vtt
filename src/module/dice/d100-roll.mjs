import BasicRollRT from "./basic-roll.mjs";
import RollConfigurationDialog from "../applications/dialogs/roll-configuration-dialog.mjs";

/**
 * D100Roll - Specialized roll class for d100 skill/characteristic tests
 * Handles success/failure calculation, degrees, and critical results
 * @extends BasicRollRT
 */
export default class D100Roll extends BasicRollRT {

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Default flavor for d100 rolls
     * @type {string}
     */
    static defaultFlavor = "Skill Test";

    /**
     * Chat template for d100 rolls
     * @type {string}
     */
    static chatTemplate = "systems/rogue-trader/templates/chat/simple-roll-chat.hbs";

    /**
     * The configuration dialog class to use
     * @type {typeof RollConfigurationDialog}
     */
    static configurationDialog = RollConfigurationDialog;

    /* -------------------------------------------- */
    /*  Roll Result Properties                      */
    /* -------------------------------------------- */

    /**
     * Get the target number for this roll
     * @type {number}
     */
    get target() {
        return this.configuration.target ?? 0;
    }

    /**
     * Check if the roll succeeded (roll <= target)
     * @type {boolean}
     */
    get isSuccess() {
        return this.total <= this.target;
    }

    /**
     * Check if the roll failed (roll > target)
     * @type {boolean}
     */
    get isFailure() {
        return !this.isSuccess;
    }

    /**
     * Calculate degrees of success (if successful)
     * Rogue Trader: DoS = floor((target - roll) / 10) + 1
     * @type {number}
     */
    get degreesOfSuccess() {
        if (!this.isSuccess) return 0;
        return Math.floor((this.target - this.total) / 10) + 1;
    }

    /**
     * Calculate degrees of failure (if failed)
     * Rogue Trader: DoF = floor((roll - target) / 10) + 1
     * @type {number}
     */
    get degreesOfFailure() {
        if (this.isSuccess) return 0;
        return Math.floor((this.total - this.target) / 10) + 1;
    }

    /**
     * Get degrees (positive for success, negative for failure)
     * @type {number}
     */
    get degrees() {
        if (this.isSuccess) return this.degreesOfSuccess;
        return -this.degreesOfFailure;
    }

    /**
     * Absolute value of degrees
     * @type {number}
     */
    get absoluteDegrees() {
        return Math.abs(this.degrees);
    }

    /**
     * Check if roll is a critical success
     * Critical Success: Roll 01-05 OR succeed by 3+ DoS
     * @type {boolean}
     */
    get isCriticalSuccess() {
        if (!this.isSuccess) return false;
        if (this.total <= 5) return true; // Natural crit (01-05)
        return this.degreesOfSuccess >= 3; // 3+ DoS
    }

    /**
     * Check if roll is a critical failure
     * Critical Failure: Roll 96-00 OR fail by 3+ DoF
     * @type {boolean}
     */
    get isCriticalFailure() {
        if (this.isSuccess) return false;
        if (this.total >= 96) return true; // Natural fumble (96-00)
        return this.degreesOfFailure >= 3; // 3+ DoF
    }

    /**
     * Check if the roll doubles (11, 22, 33, etc.)
     * Important for some special rules
     * @type {boolean}
     */
    get isDoubles() {
        const total = this.total;
        const tens = Math.floor(total / 10);
        const ones = total % 10;
        return tens === ones;
    }

    /**
     * For weapon attacks: check if doubles on a success triggers Righteous Fury
     * @type {boolean}
     */
    get triggersRighteousFury() {
        return this.isSuccess && this.isDoubles;
    }

    /* -------------------------------------------- */
    /*  Configuration Dialog                        */
    /* -------------------------------------------- */

    /**
     * Show the configuration dialog for this roll type
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object|null>} Dialog result, or null if cancelled
     * @override
     */
    static async _showConfigurationDialog(config) {
        // Use the configured dialog class
        const DialogClass = this.configurationDialog;
        if (!DialogClass) return config;

        return DialogClass.configure(config);
    }

    /* -------------------------------------------- */
    /*  Formula Construction                        */
    /* -------------------------------------------- */

    /**
     * Construct the d100 roll formula
     * @param {Object} config - Roll configuration
     * @returns {string} The roll formula (always "1d100")
     * @override
     */
    static constructFormula(config) {
        // d100 rolls don't add modifiers to the roll itself
        // Modifiers affect the target number instead
        return "1d100";
    }

    /* -------------------------------------------- */
    /*  Template Data                               */
    /* -------------------------------------------- */

    /**
     * Prepare template data for chat rendering
     * @param {D100Roll} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Template data
     * @override
     */
    static async _prepareTemplateData(roll, config) {
        const baseData = await super._prepareTemplateData(roll, config);

        // Calculate modifiers for display
        const activeModifiers = {};
        if (config.modifiers) {
            for (const [key, value] of Object.entries(config.modifiers)) {
                if (value !== 0) {
                    activeModifiers[key.toUpperCase()] = value;
                }
            }
        }

        return {
            ...baseData,
            rollData: {
                ...baseData.rollData,
                name: config.name || config.flavor || this.defaultFlavor,
                baseTarget: config.baseTarget ?? config.target,
                modifiedTarget: config.target,
                activeModifiers: activeModifiers,
                success: roll.isSuccess,
                dos: roll.degreesOfSuccess,
                dof: roll.degreesOfFailure,
                isCriticalSuccess: roll.isCriticalSuccess,
                isCriticalFailure: roll.isCriticalFailure,
                isDoubles: roll.isDoubles,
                triggersRighteousFury: roll.triggersRighteousFury,
                sheetName: config.actor?.name || config.speaker?.alias || ""
            }
        };
    }

    /**
     * Prepare chat message data with roll flags
     * @param {D100Roll} roll - The evaluated roll
     * @param {Object} config - Roll configuration
     * @returns {Promise<Object>} Chat message data
     * @override
     */
    static async _prepareChatData(roll, config) {
        const chatData = await super._prepareChatData(roll, config);

        // Add d100-specific flags
        chatData.flags["rogue-trader"] = {
            ...chatData.flags["rogue-trader"],
            target: config.target,
            baseTarget: config.baseTarget ?? config.target,
            success: roll.isSuccess,
            degrees: roll.degrees,
            degreesOfSuccess: roll.degreesOfSuccess,
            degreesOfFailure: roll.degreesOfFailure,
            isCriticalSuccess: roll.isCriticalSuccess,
            isCriticalFailure: roll.isCriticalFailure,
            isDoubles: roll.isDoubles
        };

        return chatData;
    }

    /* -------------------------------------------- */
    /*  Tooltip Rendering                           */
    /* -------------------------------------------- */

    /**
     * Render enhanced tooltip with target and degrees
     * @returns {Promise<string>} Tooltip HTML
     * @override
     */
    async getTooltip() {
        const html = await super.getTooltip();
        const target = this.target;

        // Only enhance if we have a target number
        if (target === undefined || target === null) return html;

        // Parse the HTML and add our summary
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const diceTotal = doc.querySelector(".dice-total");

        if (diceTotal) {
            const summary = document.createElement("div");
            summary.className = "rt-dice-summary";

            // Target info
            const targetDiv = document.createElement("div");
            targetDiv.className = "rt-dice-target";
            targetDiv.textContent = `Target: ${target}`;
            summary.appendChild(targetDiv);

            // Result info
            const resultDiv = document.createElement("div");
            resultDiv.className = this.isSuccess ? "rt-dice-success" : "rt-dice-failure";
            const degrees = this.isSuccess ? this.degreesOfSuccess : this.degreesOfFailure;
            const degreeLabel = this.isSuccess ? "DoS" : "DoF";
            resultDiv.textContent = `${this.isSuccess ? "Success" : "Failure"}: ${degrees} ${degreeLabel}`;
            summary.appendChild(resultDiv);

            // Critical indicator
            if (this.isCriticalSuccess) {
                const critDiv = document.createElement("div");
                critDiv.className = "rt-dice-critical";
                critDiv.textContent = "⚡ Critical Success!";
                summary.appendChild(critDiv);
            } else if (this.isCriticalFailure) {
                const critDiv = document.createElement("div");
                critDiv.className = "rt-dice-fumble";
                critDiv.textContent = "💀 Critical Failure!";
                summary.appendChild(critDiv);
            }

            // Doubles indicator (for Righteous Fury)
            if (this.isDoubles && this.isSuccess) {
                const doublesDiv = document.createElement("div");
                doublesDiv.className = "rt-dice-doubles";
                doublesDiv.textContent = "🔥 Doubles! (Righteous Fury?)";
                summary.appendChild(doublesDiv);
            }

            diceTotal.after(summary);
        }

        return doc.body.innerHTML;
    }

    /* -------------------------------------------- */
    /*  Convenience Methods                         */
    /* -------------------------------------------- */

    /**
     * Create and roll a d100 test against a target number
     * @param {Object} options - Roll options
     * @param {number} options.target - Target number to roll against
     * @param {string} [options.flavor] - Roll flavor text
     * @param {Actor} [options.actor] - The actor making the test
     * @param {Object} [options.modifiers] - Named modifiers affecting the target
     * @param {boolean} [options.configure=true] - Whether to show configuration
     * @returns {Promise<ChatMessage|null>}
     */
    static async test(options = {}) {
        return this.build({
            ...options,
            baseTarget: options.baseTarget ?? options.target
        });
    }

    /**
     * Perform a quick characteristic test
     * @param {Actor} actor - The actor making the test
     * @param {string} characteristic - The characteristic key (e.g., "weaponSkill")
     * @param {Object} [options] - Additional options
     * @returns {Promise<ChatMessage|null>}
     */
    static async characteristicTest(actor, characteristic, options = {}) {
        const charData = actor.system.characteristics?.[characteristic];
        if (!charData) {
            ui.notifications.warn(`Characteristic "${characteristic}" not found`);
            return null;
        }

        return this.test({
            actor: actor,
            target: charData.total,
            baseTarget: charData.total,
            flavor: `${charData.label || characteristic} Test`,
            speaker: ChatMessage.getSpeaker({ actor }),
            ...options
        });
    }

    /**
     * Perform a quick skill test
     * @param {Actor} actor - The actor making the test
     * @param {string} skill - The skill key (e.g., "dodge")
     * @param {Object} [options] - Additional options
     * @returns {Promise<ChatMessage|null>}
     */
    static async skillTest(actor, skill, options = {}) {
        const skillData = actor.system.skills?.[skill];
        if (!skillData) {
            ui.notifications.warn(`Skill "${skill}" not found`);
            return null;
        }

        return this.test({
            actor: actor,
            target: skillData.current,
            baseTarget: skillData.current,
            flavor: `${skillData.label || skill} Test`,
            speaker: ChatMessage.getSpeaker({ actor }),
            ...options
        });
    }
}
