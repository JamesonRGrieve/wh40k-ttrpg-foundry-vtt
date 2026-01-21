/**
 * @file CriticalInjurySheet - ApplicationV2 sheet for critical injury items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for critical injury items.
 * Displays injury details with severity slider and body location visual.
 */
export default class CriticalInjurySheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'critical-injury'],
        position: {
            width: 560,
            height: 620,
        },
        actions: {
            changeSeverity: CriticalInjurySheet.#changeSeverity,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-critical-injury-sheet-v2.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add injury-specific context
        context.damageTypes = {
            impact: 'Impact',
            rending: 'Rending',
            explosive: 'Explosive',
            energy: 'Energy',
        };

        context.bodyParts = {
            head: 'Head',
            arm: 'Arm',
            body: 'Body',
            leg: 'Leg',
        };

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle severity change - re-render to update displayed effect.
     * @this {CriticalInjurySheet}
     * @param {PointerEvent} event - Triggering event
     * @param {HTMLElement} target - Action target
     */
    static async #changeSeverity(event, target) {
        const newSeverity = parseInt(target.value);
        if (newSeverity !== this.item.system.severity) {
            await this.item.update({ 'system.severity': newSeverity });
        }
    }
}
