/**
 * Origin Roll Dialog
 *
 * Interactive dialog for rolling starting stats (wounds, fate, etc.)
 * from origin path formulas.
 *
 * Provides:
 * - Visual dice rolling with breakdown
 * - Accept/Re-roll functionality
 * - Chat message integration
 * - Result storage
 */

import { evaluateWoundsFormula, evaluateFateFormula } from "../../utils/formula-evaluator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class OriginRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "origin-roll-dialog-{rollType}",
        classes: ["rogue-trader", "origin-roll-dialog"],
        tag: "form",
        window: {
            title: "Roll Starting Stat",
            icon: "fa-solid fa-dice",
            minimizable: false,
            resizable: false
        },
        position: {
            width: 600,
            height: "auto"
        },
        actions: {
            roll: OriginRollDialog.#roll,
            accept: OriginRollDialog.#accept,
            reroll: OriginRollDialog.#reroll,
            manual: OriginRollDialog.#manual,
            cancel: OriginRollDialog.#cancel
        },
        form: {
            handler: OriginRollDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "systems/rogue-trader/templates/character-creation/origin-roll-dialog.hbs"
        }
    };

    /* -------------------------------------------- */

    /**
     * @param {string} rollType - Type of roll: "wounds" or "fate"
     * @param {string} formula - The formula to roll
     * @param {object} context - Context data
     * @param {Actor} context.actor - The character actor
     * @param {Item} context.originItem - The origin item being rolled for
     * @param {object} [options={}] - Additional options
     */
    constructor(rollType, formula, context, options = {}) {
        super(options);

        /**
         * Type of roll
         * @type {string}
         */
        this.rollType = rollType;

        /**
         * Formula to evaluate
         * @type {string}
         */
        this.formula = formula;

        /**
         * Context data
         * @type {object}
         */
        this.context = context;

        /**
         * Current roll result
         * @type {object|null}
         */
        this.rollResult = null;

        /**
         * Promise resolver
         * @type {Function|null}
         * @private
         */
        this._resolvePromise = null;

        /**
         * Roll history (for showing previous attempts)
         * @type {Array}
         */
        this.rollHistory = [];
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        const typeLabel = this.rollType === "wounds" ? "Wounds" : "Fate Points";
        return `Roll Starting ${typeLabel}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.rollType = this.rollType;
        context.rollTypeLabel = this.rollType === "wounds" ? "Wounds" : "Fate Points";
        context.formula = this.formula;
        context.description = this._getDescription();
        context.originName = this.context.originItem.name;
        context.actorName = this.context.actor.name;

        // Roll result data
        context.rollResult = this.rollResult;
        context.hasRolled = !!this.rollResult;
        context.rollHistory = this.rollHistory;
        context.showHistory = this.rollHistory.length > 1;

        // Actor context for formula display
        if (this.rollType === "wounds") {
            const tb = this.context.actor.system.characteristics?.toughness?.bonus || 0;
            context.actorTB = tb;
            context.expandedFormula = this._expandWoundsFormula(this.formula, tb);
        }

        return context;
    }

    /**
     * Get description text for this roll type.
     * @returns {string}
     * @private
     */
    _getDescription() {
        if (this.rollType === "wounds") {
            return "Roll to determine your starting Wounds. This represents your ability to withstand damage.";
        } else if (this.rollType === "fate") {
            return "Roll to determine your starting Fate Points. Fate Points allow you to avoid death and re-roll critical tests.";
        }
        return "";
    }

    /**
     * Expand wounds formula for display.
     * @param {string} formula - Raw formula
     * @param {number} tb - Toughness bonus
     * @returns {string}
     * @private
     */
    _expandWoundsFormula(formula, tb) {
        // Replace "TB" with actual value for display
        // e.g., "2xTB+1d5+2" becomes "2×4+1d5+2"
        return formula.replace(/(\d+)xTB/gi, (match, multiplier) => {
            return `${multiplier}×${tb}`;
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll the dice!
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #roll(event, target) {
        event.preventDefault();

        try {
            // Evaluate the formula based on type
            if (this.rollType === "wounds") {
                this.rollResult = await this._rollWounds();
            } else if (this.rollType === "fate") {
                this.rollResult = await this._rollFate();
            }

            // Add to history
            this.rollHistory.push({
                timestamp: Date.now(),
                result: this.rollResult.total,
                breakdown: this.rollResult.breakdown
            });

            // Send to chat
            await this._postRollToChat();

            // Re-render to show result
            await this.render();

        } catch (error) {
            console.error("Error rolling:", error);
            ui.notifications.error("Error rolling dice. Check console for details.");
        }
    }

    /**
     * Accept the current roll result.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #accept(event, target) {
        event.preventDefault();

        if (!this.rollResult) {
            ui.notifications.warn("Please roll or input a value first!");
            return;
        }

        if (this._resolvePromise) {
            this._resolvePromise(this.rollResult);
        }

        this.close();
    }

    /**
     * Re-roll the dice - returns to initial state so player can choose roll or manual.
     * 
     * This clears the current result and re-renders the dialog to show the initial state
     * with both "Roll For Me" and "I'll Roll Myself" options available again.
     * 
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #reroll(event, target) {
        event.preventDefault();

        // Clear current result to return to initial state
        // Player can then choose "Roll For Me" or "I'll Roll Myself" again
        this.rollResult = null;

        // Re-render to show the initial state with both options
        await this.render();
    }

    /**
     * Manual input of value.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #manual(event, target) {
        event.preventDefault();

        const formula = this.formula;
        const rollType = this.rollType;
        
        if (rollType === "wounds") {
            // For wounds, handle the full formula including static components
            await this._handleManualWounds();
        } else if (rollType === "fate") {
            // For fate, handle the conditional formula
            await this._handleManualFate();
        }
    }

    /**
     * Handle manual wounds input with full formula calculation.
     * @private
     */
    async _handleManualWounds() {
        const formula = this.formula;
        const actor = this.context.actor;
        const tb = actor.system.characteristics?.toughness?.bonus || 0;
        
        // Check if this is a 1d5 formula
        const is1d5 = /1d5/.test(formula);
        const is1d10 = /1d10/.test(formula);
        
        let instructionText = is1d5 
            ? "Roll 1d10 and enter the result (it will be divided by 2, rounded up for 1d5):"
            : is1d10 
                ? "Roll 1d10 and enter the result:"
                : "Enter the dice result:";
        
        // Show expanded formula with TB value
        const expandedFormula = formula.replace(/(\d+)xTB/gi, (match, multiplier) => {
            return `${multiplier}×${tb}`;
        });
        
        let hintText = `<strong>Formula:</strong> <code>${formula}</code> = <code>${expandedFormula}</code>`;
        if (is1d5) {
            hintText += `<br><strong>Note:</strong> For 1d5, roll a d10 and divide by 2, rounded up.`;
        }

        // Prompt for dice roll only
        const diceValue = await Dialog.prompt({
            title: "Manual Wounds Roll",
            content: `
                <form>
                    <div class="form-group">
                        <label>${instructionText}</label>
                        <input type="number" name="value" min="1" max="10" value="" autofocus />
                        <p class="hint">${hintText}</p>
                    </div>
                </form>
            `,
            callback: (html) => {
                const input = html.find('input[name="value"]').val();
                return parseInt(input);
            },
            rejectClose: false
        });

        if (!diceValue || isNaN(diceValue)) return;

        // Calculate the final value using the full formula
        // Parse formula: e.g., "2xTB+1d5+2"
        let diceResult = diceValue;
        if (is1d5) {
            diceResult = Math.ceil(diceValue / 2);
        }
        
        // Calculate static components
        let staticTotal = 0;
        let breakdownParts = [];
        
        // Handle TB multiplier
        const tbMatch = formula.match(/(\d+)xTB/i);
        if (tbMatch) {
            const multiplier = parseInt(tbMatch[1]);
            staticTotal += multiplier * tb;
            breakdownParts.push(`${multiplier}×${tb}`);
        }
        
        // Handle the dice
        if (is1d5) {
            breakdownParts.push(`[${diceResult}]`);
        } else if (is1d10) {
            breakdownParts.push(`[${diceResult}]`);
        }
        
        // Handle additional static modifiers like +2
        const additionalMatch = formula.match(/\+(\d+)$/);
        if (additionalMatch) {
            const additional = parseInt(additionalMatch[1]);
            staticTotal += additional;
            breakdownParts.push(`${additional}`);
        }
        
        const finalValue = staticTotal + diceResult;
        const breakdownText = `${breakdownParts.join(' + ')} = ${finalValue}`;

        // Create a manual result
        this.rollResult = {
            type: this.rollType,
            formula: this.formula,
            total: finalValue,
            breakdown: breakdownText,
            manual: true,
            timestamp: Date.now()
        };

        // Add to history
        this.rollHistory.push({
            timestamp: Date.now(),
            result: finalValue,
            breakdown: breakdownText
        });

        // Re-render to show result
        await this.render();
    }

    /**
     * Handle manual fate input with conditional formula.
     * @private
     */
    async _handleManualFate() {
        const formula = this.formula;
        
        // Parse the conditional format: "(1-5|=2),(6-10|=3)"
        const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
        const conditions = [...formula.matchAll(conditionRegex)];
        
        // Build options description
        let optionsText = conditions.map(match => {
            const [, min, max, outcome] = match;
            return `${min}-${max} → ${outcome} Fate Points`;
        }).join('<br>');

        // Prompt for the d10 roll
        const diceValue = await Dialog.prompt({
            title: "Manual Fate Roll",
            content: `
                <form>
                    <div class="form-group">
                        <label>Roll 1d10 and enter the result:</label>
                        <input type="number" name="value" min="1" max="10" value="" autofocus />
                        <p class="hint"><strong>Results:</strong><br>${optionsText}</p>
                    </div>
                </form>
            `,
            callback: (html) => {
                const input = html.find('input[name="value"]').val();
                return parseInt(input);
            },
            rejectClose: false
        });

        if (!diceValue || isNaN(diceValue)) return;

        // Find matching condition
        let result = 0;
        let matchedRange = "";
        
        for (const match of conditions) {
            const [, min, max, outcome] = match;
            const minVal = parseInt(min);
            const maxVal = parseInt(max);
            const outcomeVal = parseInt(outcome);

            if (diceValue >= minVal && diceValue <= maxVal) {
                result = outcomeVal;
                matchedRange = `${min}-${max}`;
                break;
            }
        }

        const breakdownText = `Rolled ${diceValue} on 1d10 (${matchedRange} → ${result} Fate Points)`;

        // Create a manual result
        this.rollResult = {
            type: this.rollType,
            formula: this.formula,
            rolled: diceValue,
            total: result,
            breakdown: breakdownText,
            manual: true,
            timestamp: Date.now()
        };

        // Add to history
        this.rollHistory.push({
            timestamp: Date.now(),
            result: result,
            breakdown: breakdownText
        });

        // Re-render to show result
        await this.render();
    }

    /**
     * Cancel the dialog.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #cancel(event, target) {
        event.preventDefault();

        if (this._resolvePromise) {
            this._resolvePromise(null);
        }

        this.close();
    }

    /**
     * Form submit handler.
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    static async #onSubmit(event, form, formData) {
        // Same as accept
        return this.#accept.call(this, event, form);
    }

    /* -------------------------------------------- */
    /*  Rolling Logic                               */
    /* -------------------------------------------- */

    /**
     * Roll wounds using the formula.
     * @returns {Promise<object>}
     * @private
     */
    async _rollWounds() {
        const actor = this.context.actor;
        const formula = this.formula;

        // Get toughness bonus
        const tb = actor.system.characteristics?.toughness?.bonus || 0;

        // Parse formula: e.g., "2xTB+1d5+2"
        // Replace TB with actual value
        let diceFormula = formula.replace(/(\d+)xTB/gi, (match, multiplier) => {
            const value = parseInt(multiplier) * tb;
            return value.toString();
        });

        // Now we have something like "8+1d5+2"
        // Evaluate using Roll
        const roll = new Roll(diceFormula);
        await roll.evaluate();

        // Create detailed breakdown
        const breakdown = this._formatWoundsBreakdown(formula, tb, roll);

        return {
            type: "wounds",
            formula: formula,
            expandedFormula: diceFormula,
            total: roll.total,
            breakdown: breakdown,
            roll: roll,
            timestamp: Date.now()
        };
    }

    /**
     * Roll fate using the formula.
     * @returns {Promise<object>}
     * @private
     */
    async _rollFate() {
        const formula = this.formula;

        // Fate formulas are typically conditional: "(1-5|=2),(6-10|=3)"
        // This means: roll 1d10, if 1-5 → 2 fate, if 6-10 → 3 fate

        // Roll 1d10
        const roll = new Roll("1d10");
        await roll.evaluate();
        const rolledValue = roll.total;

        // Parse conditions
        const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
        const conditions = [...formula.matchAll(conditionRegex)];

        let result = 0;
        let matchedRange = "";

        for (const match of conditions) {
            const [, min, max, outcome] = match;
            const minVal = parseInt(min);
            const maxVal = parseInt(max);
            const outcomeVal = parseInt(outcome);

            if (rolledValue >= minVal && rolledValue <= maxVal) {
                result = outcomeVal;
                matchedRange = `${min}-${max}`;
                break;
            }
        }

        const breakdown = `Rolled ${rolledValue} on 1d10 (${matchedRange} → ${result} Fate Points)`;

        return {
            type: "fate",
            formula: formula,
            rolled: rolledValue,
            total: result,
            breakdown: breakdown,
            roll: roll,
            timestamp: Date.now()
        };
    }

    /**
     * Format wounds roll breakdown for display.
     * @param {string} originalFormula - Original formula
     * @param {number} tb - Toughness bonus
     * @param {Roll} roll - Evaluated roll
     * @returns {string}
     * @private
     */
    _formatWoundsBreakdown(originalFormula, tb, roll) {
        // Create human-readable breakdown
        // e.g., "2×TB + 1d5 + 2 = 2×4 + [3] + 2 = 13"

        let breakdown = originalFormula;

        // Replace TB with value
        breakdown = breakdown.replace(/(\d+)xTB/gi, (match, multiplier) => {
            return `${multiplier}×${tb}`;
        });

        // Find dice terms and show their results
        const diceTerms = roll.terms.filter(t => t instanceof foundry.dice.terms.Die);
        if (diceTerms.length > 0) {
            breakdown = breakdown.replace(/(\d+)d(\d+)/g, (match) => {
                const term = diceTerms.shift();
                if (term) {
                    const results = term.results.map(r => r.result).join('+');
                    return `[${results}]`;
                }
                return match;
            });
        }

        breakdown += ` = ${roll.total}`;

        return breakdown;
    }

    /**
     * Post roll result to chat.
     * @returns {Promise<ChatMessage>}
     * @private
     */
    async _postRollToChat() {
        const templateData = {
            actor: this.context.actor.name,
            actorImg: this.context.actor.img,
            origin: this.context.originItem.name,
            originImg: this.context.originItem.img,
            rollType: this.rollType,
            rollTypeLabel: this.rollType === "wounds" ? "Wounds" : "Fate Points",
            formula: this.formula,
            result: this.rollResult.total,
            breakdown: this.rollResult.breakdown,
            timestamp: new Date(this.rollResult.timestamp).toLocaleTimeString()
        };

        const html = await renderTemplate(
            "systems/rogue-trader/templates/chat/origin-roll-card.hbs",
            templateData
        );

        return ChatMessage.create({
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: this.context.actor }),
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
            rolls: [this.rollResult.roll],
            sound: CONFIG.sounds.dice
        });
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Show the roll dialog and await user interaction.
     * @param {string} rollType - "wounds" or "fate"
     * @param {string} formula - The formula to roll
     * @param {object} context - Context object with actor and originItem
     * @returns {Promise<object|null>} Roll result or null if cancelled
     */
    static async show(rollType, formula, context) {
        const dialog = new OriginRollDialog(rollType, formula, context);

        // Create promise that will be resolved when user accepts/cancels
        const result = new Promise(resolve => {
            dialog._resolvePromise = resolve;
        });

        // Render the dialog (don't auto-roll, let user choose)
        await dialog.render(true);

        return result;
    }
}
