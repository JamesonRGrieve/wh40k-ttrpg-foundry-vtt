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

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `foundry.applications` has no shipped type for the v2 api namespace
const foundryApi = foundry.applications as unknown as {
    api: {
        ApplicationV2: ApplicationV2Ctor;
        HandlebarsApplicationMixin: <T extends ApplicationV2Ctor>(base: T) => T;
    };
};
const { ApplicationV2, HandlebarsApplicationMixin } = foundryApi.api;
const LegacyDialog = foundry.appv1.api.Dialog;

/** Extract numeric value from a Foundry v1 Dialog callback `html` argument. */
function readDialogNumber(html: JQuery<HTMLElement>): number {
    const root = html[0];
    if (root === undefined) return NaN;
    const form = root.querySelector('form');
    const input = form?.querySelector<HTMLInputElement>('[name="value"]') ?? null;
    return parseInt(input?.value ?? '', 10);
}

/** Minimal shape of a roll result object produced by this dialog. */
interface OriginRollResult {
    type: string;
    formula: string;
    total: number;
    breakdown: string;
    manual?: boolean;
    timestamp: number;
    roll?: Roll;
    rolled?: number;
    expandedFormula?: string;
}

interface OriginRollActor {
    name: string;
    img: string;
    system: {
        characteristics?: Record<string, { bonus?: number } | undefined>;
    };
}

interface OriginRollOriginItem {
    name: string;
    img: string;
}

/** Context passed into the dialog (actor + origin item). */
interface OriginRollContext {
    actor: OriginRollActor;
    originItem: OriginRollOriginItem;
}

/** Render context additions produced by `_prepareContext` for the dialog template. */
interface OriginRollRenderContextAdditions {
    rollType: string;
    rollTypeLabel: string;
    formula: string;
    description: string;
    originName: string;
    originImg: string;
    actorName: string;
    rollResult: OriginRollResult | null;
    hasRolled: boolean;
    rollHistory: { timestamp: number; result: number; breakdown: string }[];
    showHistory: boolean;
    actorTB?: number;
    expandedFormula?: string;
}

export default class OriginRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** Type of roll: "wounds", "fate", or "thrones" */
    rollType: string;

    /** The formula string to evaluate */
    formula: string;

    /** Context data containing actor and originItem */
    context: OriginRollContext;

    /** Current roll result, or null if not yet rolled */
    rollResult: OriginRollResult | null;

    /** Promise resolver invoked when the user accepts or cancels */
    _resolvePromise: ((value: OriginRollResult | null) => void) | null;

    /** History of previous roll attempts */
    rollHistory: { timestamp: number; result: number; breakdown: string }[];

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'origin-roll-dialog-{rollType}',
        classes: ['wh40k-rpg', 'origin-roll-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.OriginPath.StartingStats',
            icon: 'fa-solid fa-dice',
            minimizable: false,
            resizable: false,
        },
        position: {
            width: 600,
            height: 'auto' as const,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            roll: OriginRollDialog.#roll,
            accept: OriginRollDialog.#accept,
            reroll: OriginRollDialog.#reroll,
            manual: OriginRollDialog.#manual,
            cancel: OriginRollDialog.#cancel,
        },
        form: {
            handler: OriginRollDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: false,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/character-creation/origin-roll-dialog.hbs',
        },
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
    constructor(rollType: string, formula: string, context: OriginRollContext, options: Partial<foundry.applications.api.ApplicationV2.Configuration> = {}) {
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
    override get title(): string {
        if (this.rollType === 'wounds') return game.i18n.localize('WH40K.OriginPath.RollStartingWounds');
        if (this.rollType === 'thrones') return game.i18n.localize('WH40K.OriginPath.RollStartingThrones');
        return game.i18n.localize('WH40K.OriginPath.RollStartingFate');
    }

    /**
     * Label for the current roll type (used in templates and chat cards).
     * @private
     */
    _getRollTypeLabel(): string {
        if (this.rollType === 'wounds') return 'Wounds';
        if (this.rollType === 'thrones') return 'Throne Gelt';
        return 'Fate Points';
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `_prepareContext` returns Record<string, unknown> per its v2 ApplicationV2 type
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/unbound-method -- boundary: super._prepareContext is typed by Foundry as Record<string, unknown>
        const superCall = super._prepareContext as (o: ApplicationV2Config.RenderOptions) => Promise<Record<string, unknown>>;
        const superCtx = await superCall.call(this, options);

        const additions: OriginRollRenderContextAdditions = {
            rollType: this.rollType,
            rollTypeLabel: this._getRollTypeLabel(),
            formula: this.formula,
            description: this._getDescription(),
            originName: this.context.originItem.name,
            originImg: this.context.originItem.img,
            actorName: this.context.actor.name,
            rollResult: this.rollResult,
            hasRolled: this.rollResult !== null,
            rollHistory: this.rollHistory,
            showHistory: this.rollHistory.length > 1,
        };

        if (this.rollType === 'wounds') {
            const tb = this.context.actor.system.characteristics?.['toughness']?.bonus ?? 0;
            additions.actorTB = tb;
            additions.expandedFormula = this._expandWoundsFormula(this.formula, tb);
        }

        return { ...superCtx, ...additions };
    }

    /**
     * Get description text for this roll type.
     * @returns {string}
     * @private
     */
    _getDescription(): string {
        if (this.rollType === 'wounds') {
            return 'Roll to determine your starting Wounds. This represents your ability to withstand damage.';
        } else if (this.rollType === 'fate') {
            return 'Roll to determine your starting Fate Points. Fate Points allow you to avoid death and re-roll critical tests.';
        } else if (this.rollType === 'thrones') {
            return 'Roll to determine your starting Throne Gelt — your initial monetary funds.';
        }
        return '';
    }

    /**
     * Expand wounds formula for display.
     * @param {string} formula - Raw formula
     * @param {number} tb - Toughness bonus
     * @returns {string}
     * @private
     */
    _expandWoundsFormula(formula: string, tb: number): string {
        // Replace "TB" with actual value for display
        // e.g., "2xTB+1d5+2" becomes "2×4+1d5+2"
        return formula.replace(/(\d+)xTB/gi, (_match, multiplier: string) => {
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
    static async #roll(this: OriginRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        try {
            // Evaluate the formula based on type
            if (this.rollType === 'wounds') {
                this.rollResult = await this._rollWounds();
            } else if (this.rollType === 'fate') {
                this.rollResult = await this._rollFate();
            } else if (this.rollType === 'thrones') {
                this.rollResult = await this._rollThrones();
            } else {
                ui.notifications.error(game.i18n.format('WH40K.OriginPath.RollErrorUnsupportedType', { type: this.rollType }));
                return;
            }

            // Add to history
            this.rollHistory.push({
                timestamp: Date.now(),
                result: this.rollResult.total,
                breakdown: this.rollResult.breakdown,
            });

            // Send to chat
            await this._postRollToChat();

            // Re-render to show result
            await this.render();
        } catch (error) {
            console.error('Error rolling:', error);
            ui.notifications.error(game.i18n.localize('WH40K.OriginPath.RollErrorGeneric'));
        }
    }

    /**
     * Accept the current roll result.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static #accept(this: OriginRollDialog, event: Event, _target: HTMLElement): void {
        event.preventDefault();

        if (!this.rollResult) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.RollPromptFirst'));
            return;
        }

        if (this._resolvePromise) {
            this._resolvePromise(this.rollResult);
        }

        void this.close();
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
    static async #reroll(this: OriginRollDialog, event: Event, _target: HTMLElement): Promise<void> {
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
    static async #manual(this: OriginRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const rollType = this.rollType;

        if (rollType === 'wounds') {
            // For wounds, handle the full formula including static components
            await this._handleManualWounds();
        } else if (rollType === 'fate') {
            // For fate, handle the conditional formula
            await this._handleManualFate();
        } else if (rollType === 'thrones') {
            await this._handleManualThrones();
        }
    }

    /**
     * Handle manual wounds input with full formula calculation.
     * @private
     */
    async _handleManualWounds(): Promise<void> {
        const formula = this.formula;
        const actor = this.context.actor;
        const tb = actor.system.characteristics?.['toughness']?.bonus ?? 0;

        // Check if this is a 1d5 formula
        const is1d5 = formula.includes('1d5');
        const is1d10 = formula.includes('1d10');

        const instructionText = is1d5
            ? 'Roll 1d10 and enter the result (it will be divided by 2, rounded up for 1d5):'
            : is1d10
            ? 'Roll 1d10 and enter the result:'
            : 'Enter the dice result:';

        // Show expanded formula with TB value
        const expandedFormula = formula.replace(/(\d+)xTB/gi, (_match: string, multiplier: string) => {
            return `${multiplier}×${tb}`;
        });

        let hintText = `<strong>Formula:</strong> <code>${formula}</code> = <code>${expandedFormula}</code>`;
        if (is1d5) {
            hintText += `<br><strong>Note:</strong> For 1d5, roll a d10 and divide by 2, rounded up.`;
        }

        // Prompt for dice roll only
        const diceValue = await LegacyDialog.prompt({
            title: game.i18n.localize('WH40K.OriginPath.ManualWoundsTitle'),
            content: `
                <form>
                    <div class="form-group">
                        <label>${instructionText}</label>
                        <input type="number" name="value" min="1" max="10" value="" autofocus />
                        <p class="hint">${hintText}</p>
                    </div>
                </form>
            `,
            callback: (html: JQuery<HTMLElement>) => readDialogNumber(html),
            rejectClose: false,
        });

        if (diceValue === null || Number.isNaN(diceValue) || diceValue === 0) return;

        // Calculate the final value using the full formula
        // Parse formula: e.g., "2xTB+1d5+2"
        let diceResult: number = diceValue;
        if (is1d5) {
            diceResult = Math.ceil(diceValue / 2);
        }

        // Parse all components of the formula (e.g. "8+1d5", "2xTB+1d5+2")
        let staticTotal = 0;
        const breakdownParts: string[] = [];

        // Strip the dice term to isolate static parts
        const withoutDice = formula
            .replace(/\d+d\d+/i, '')
            .replace(/\+\s*\+/g, '+')
            .replace(/^\+|\+$/g, '');

        // Handle TB multiplier
        const tbMatch = withoutDice.match(/(\d+)xTB/i);
        if (tbMatch) {
            const multiplier = parseInt(tbMatch[1] ?? '', 10);
            staticTotal += multiplier * tb;
            breakdownParts.push(`${multiplier}×${tb}`);
        }

        // Handle all plain number terms (leading, trailing, or multiple)
        const staticWithoutTB = withoutDice.replace(/\d+xTB/i, '');
        const numberMatches = staticWithoutTB.match(/\d+/g);
        if (numberMatches) {
            for (const n of numberMatches) {
                const val = parseInt(n, 10);
                staticTotal += val;
                breakdownParts.push(`${val}`);
            }
        }

        // Add the dice result
        breakdownParts.push(`[${diceResult}]`);

        const finalValue = staticTotal + diceResult;
        const breakdownText = `${breakdownParts.join(' + ')} = ${finalValue}`;

        // Create a manual result
        this.rollResult = {
            type: this.rollType,
            formula: this.formula,
            total: finalValue,
            breakdown: breakdownText,
            manual: true,
            timestamp: Date.now(),
        };

        // Add to history
        this.rollHistory.push({
            timestamp: Date.now(),
            result: finalValue,
            breakdown: breakdownText,
        });

        // Re-render to show result
        await this.render();
    }

    /**
     * Handle manual fate input with conditional formula.
     * @private
     */
    async _handleManualFate(): Promise<void> {
        const formula = this.formula;

        // Plain number formula (e.g. "3") — no roll needed
        if (/^\d+$/.test(formula.trim())) {
            const total = parseInt(formula.trim(), 10);
            this.rollResult = {
                type: this.rollType,
                formula: this.formula,
                rolled: total,
                total: total,
                breakdown: `${total} Fate Points (fixed)`,
                manual: true,
                timestamp: Date.now(),
            };
            this.rollHistory.push({ timestamp: Date.now(), result: total, breakdown: `${total} (fixed)` });
            await this.render();
            return;
        }

        // Parse the conditional format: "(1-5|=2),(6-10|=3)"
        const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
        const conditions = [...formula.matchAll(conditionRegex)];

        // Build options description
        const optionsText = conditions
            .map((match) => {
                const [, min, max, outcome] = match;
                return `${min}-${max} → ${outcome} Fate Points`;
            })
            .join('<br>');

        // Prompt for the d10 roll
        const diceValue = await LegacyDialog.prompt({
            title: game.i18n.localize('WH40K.OriginPath.ManualFateTitle'),
            content: `
                <form>
                    <div class="form-group">
                        <label>Roll 1d10 and enter the result:</label>
                        <input type="number" name="value" min="1" max="10" value="" autofocus />
                        <p class="hint"><strong>Results:</strong><br>${optionsText}</p>
                    </div>
                </form>
            `,
            callback: (html: JQuery<HTMLElement>) => readDialogNumber(html),
            rejectClose: false,
        });

        if (diceValue === null || Number.isNaN(diceValue) || diceValue === 0) return;

        // Find matching condition
        let result = 0;
        let matchedRange = '';

        for (const match of conditions) {
            const [, min, max, outcome] = match;
            const minVal = parseInt(min ?? '', 10);
            const maxVal = parseInt(max ?? '', 10);
            const outcomeVal = parseInt(outcome ?? '', 10);

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
            timestamp: Date.now(),
        };

        // Add to history
        this.rollHistory.push({
            timestamp: Date.now(),
            result: result,
            breakdown: breakdownText,
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
    static #cancel(this: OriginRollDialog, event: Event, _target: HTMLElement): void {
        event.preventDefault();

        if (this._resolvePromise) {
            this._resolvePromise(null);
        }

        void this.close();
    }

    /**
     * Form submit handler.
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry FormDataExtended payload
    static #onSubmit(this: OriginRollDialog, event: Event, form: HTMLFormElement, _formData: Record<string, unknown>): void {
        // Same as accept
        OriginRollDialog.#accept.call(this, event, form);
    }

    /* -------------------------------------------- */
    /*  Rolling Logic                               */
    /* -------------------------------------------- */

    /**
     * Roll wounds using the formula.
     * @returns {Promise<object>}
     * @private
     */
    async _rollWounds(): Promise<OriginRollResult> {
        const actor = this.context.actor;
        const formula = this.formula;

        // Get toughness bonus
        const tb = actor.system.characteristics?.['toughness']?.bonus ?? 0;

        // Parse formula: e.g., "2xTB+1d5+2"
        // Replace TB with actual value
        const diceFormula = formula.replace(/(\d+)xTB/gi, (_match: string, multiplier: string) => {
            const value = parseInt(multiplier, 10) * tb;
            return value.toString();
        });

        // Now we have something like "8+1d5+2"
        // Evaluate using Roll
        const roll = new Roll(diceFormula);
        await roll.evaluate();

        // Create detailed breakdown
        const breakdown = this._formatWoundsBreakdown(formula, tb, roll);

        return {
            type: 'wounds',
            formula: formula,
            expandedFormula: diceFormula,
            total: roll.total ?? 0,
            breakdown: breakdown,
            roll: roll,
            timestamp: Date.now(),
        };
    }

    /**
     * Roll fate using the formula.
     * @returns {Promise<object>}
     * @private
     */
    async _rollFate(): Promise<OriginRollResult> {
        const formula = this.formula;

        // Plain number formula (e.g. "3") — no roll needed, fixed value
        if (/^\d+$/.test(formula.trim())) {
            const total = parseInt(formula.trim(), 10);
            return {
                type: 'fate',
                formula: formula,
                rolled: total,
                total: total,
                breakdown: `${total} Fate Points (fixed)`,
                timestamp: Date.now(),
            };
        }

        // Fate formulas are typically conditional: "(1-5|=2),(6-10|=3)"
        // This means: roll 1d10, if 1-5 → 2 fate, if 6-10 → 3 fate

        // Roll 1d10
        const roll = new Roll('1d10');
        await roll.evaluate();
        const rolledValue = roll.total ?? 0;

        // Parse conditions
        const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
        const conditions = [...formula.matchAll(conditionRegex)];

        let result = 0;
        let matchedRange = '';

        for (const match of conditions) {
            const [, min, max, outcome] = match;
            const minVal = parseInt(min ?? '', 10);
            const maxVal = parseInt(max ?? '', 10);
            const outcomeVal = parseInt(outcome ?? '', 10);

            if (rolledValue >= minVal && rolledValue <= maxVal) {
                result = outcomeVal;
                matchedRange = `${min}-${max}`;
                break;
            }
        }

        const breakdown = `Rolled ${rolledValue} on 1d10 (${matchedRange} → ${result} Fate Points)`;

        return {
            type: 'fate',
            formula: formula,
            rolled: rolledValue,
            total: result,
            breakdown: breakdown,
            roll: roll,
            timestamp: Date.now(),
        };
    }

    /**
     * Roll throne gelt using the formula (standard dice formula like "2d10" or "1d10+5").
     * @returns {Promise<object>}
     * @private
     */
    async _rollThrones(): Promise<OriginRollResult> {
        const formula = this.formula;

        // Plain number formula — fixed value
        if (/^\d+$/.test(formula.trim())) {
            const total = parseInt(formula.trim(), 10);
            return {
                type: 'thrones',
                formula: formula,
                rolled: total,
                total: total,
                breakdown: `${total}₮ (fixed)`,
                timestamp: Date.now(),
            };
        }

        const roll = new Roll(formula);
        await roll.evaluate();

        const diceTerms = roll.terms.filter((t) => t instanceof foundry.dice.terms.Die);
        let breakdown = formula;
        if (diceTerms.length > 0) {
            const termsCopy = [...diceTerms];
            breakdown = formula.replace(/(\d+)d(\d+)/g, (match) => {
                const term = termsCopy.shift();
                if (term) {
                    const results = term.results.map((r) => r.result).join('+');
                    return `[${results}]`;
                }
                return match;
            });
        }
        breakdown += ` = ${roll.total}₮`;

        return {
            type: 'thrones',
            formula: formula,
            rolled: roll.total ?? 0,
            total: roll.total ?? 0,
            breakdown: breakdown,
            roll: roll,
            timestamp: Date.now(),
        };
    }

    /**
     * Handle manual throne gelt input — prompt for dice result, apply formula arithmetic.
     * @private
     */
    async _handleManualThrones(): Promise<void> {
        const formula = this.formula;

        // Plain number formula — no dice
        if (/^\d+$/.test(formula.trim())) {
            const fixedTotal = parseInt(formula.trim(), 10);
            this.rollResult = {
                type: 'thrones',
                formula: formula,
                rolled: fixedTotal,
                total: fixedTotal,
                breakdown: `${fixedTotal}₮ (fixed)`,
                manual: true,
                timestamp: Date.now(),
            };
            this.rollHistory.push({ timestamp: Date.now(), result: fixedTotal, breakdown: `${fixedTotal}₮ (fixed)` });
            await this.render();
            return;
        }

        // Prompt for the dice result
        const diceValue = await LegacyDialog.prompt({
            title: game.i18n.localize('WH40K.OriginPath.ManualThronesTitle'),
            content: `
                <form>
                    <div class="form-group">
                        <label>Roll <code>${formula}</code> and enter the dice total:</label>
                        <input type="number" name="value" min="0" value="" autofocus />
                        <p class="hint">Enter the sum of your dice rolls only — static bonuses in the formula will be added automatically.</p>
                    </div>
                </form>
            `,
            callback: (html: JQuery<HTMLElement>) => readDialogNumber(html),
            rejectClose: false,
        });

        if (diceValue === null || Number.isNaN(diceValue)) return;

        // Sum static bonuses from formula (strip dice terms)
        const withoutDice = formula.replace(/\d+d\d+/gi, '0');
        let staticTotal = 0;
        const staticMatches = withoutDice.match(/[+-]?\s*\d+/g);
        if (staticMatches) {
            for (const n of staticMatches) {
                staticTotal += parseInt(n.replace(/\s+/g, ''), 10);
            }
        }

        const total = diceValue + staticTotal;
        const breakdown = staticTotal === 0 ? `[${diceValue}] = ${total}₮` : `[${diceValue}] + ${staticTotal} = ${total}₮`;

        this.rollResult = {
            type: 'thrones',
            formula: formula,
            rolled: total,
            total: total,
            breakdown: breakdown,
            manual: true,
            timestamp: Date.now(),
        };
        this.rollHistory.push({ timestamp: Date.now(), result: total, breakdown });
        await this.render();
    }

    /**
     * Format wounds roll breakdown for display.
     * @param {string} originalFormula - Original formula
     * @param {number} tb - Toughness bonus
     * @param {Roll} roll - Evaluated roll
     * @returns {string}
     * @private
     */
    _formatWoundsBreakdown(originalFormula: string, tb: number, roll: Roll): string {
        // Create human-readable breakdown
        // e.g., "2×TB + 1d5 + 2 = 2×4 + [3] + 2 = 13"

        let breakdown = originalFormula;

        // Replace TB with value
        breakdown = breakdown.replace(/(\d+)xTB/gi, (_match, multiplier: string) => {
            return `${multiplier}×${tb}`;
        });

        // Find dice terms and show their results
        const diceTerms = roll.terms.filter((t) => t instanceof foundry.dice.terms.Die);
        if (diceTerms.length > 0) {
            breakdown = breakdown.replace(/(\d+)d(\d+)/g, (match) => {
                const term = diceTerms.shift();
                if (term) {
                    const results = term.results.map((r) => r.result).join('+');
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
    async _postRollToChat(): Promise<ChatMessage | undefined> {
        // _postRollToChat is only called after rollResult is set; guard here for type safety.
        const result = this.rollResult;
        if (!result) return undefined;
        const templateData = {
            actor: this.context.actor.name,
            actorImg: this.context.actor.img,
            origin: this.context.originItem.name,
            originImg: this.context.originItem.img,
            rollType: this.rollType,
            rollTypeLabel: this._getRollTypeLabel(),
            formula: this.formula,
            result: result.total,
            breakdown: result.breakdown,
            timestamp: new Date(result.timestamp).toLocaleTimeString(),
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/origin-roll-card.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker expects WH40KBaseActor; OriginRollContext stores a structural subset.
        const speakerActor = this.context.actor as unknown as WH40KBaseActor;
        const configSounds = (CONFIG as { sounds?: { dice?: string } }).sounds;
        return ChatMessage.create({
            content: html,
            speaker: ChatMessage.getSpeaker({ actor: speakerActor }),
            ...(result.roll ? { rolls: [result.roll] } : {}),
            sound: configSounds?.dice ?? '',
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
    static async show(rollType: string, formula: string, context: OriginRollContext): Promise<OriginRollResult | null> {
        const dialog = new OriginRollDialog(rollType, formula, context);

        // Create promise that will be resolved when user accepts/cancels
        const result = new Promise<OriginRollResult | null>((resolve) => {
            dialog._resolvePromise = resolve;
        });

        // Render the dialog (don't auto-roll, let user choose)
        await dialog.render({ force: true });

        return result;
    }
}
