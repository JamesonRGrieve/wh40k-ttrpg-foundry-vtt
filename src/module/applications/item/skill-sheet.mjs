/**
 * @file SkillSheet - ApplicationV2 sheet for skill items (compendium skills)
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for skill items (used in compendiums).
 * Redesigned with Imperial Gothic theme and comprehensive layout.
 */
export default class SkillSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'skill'],
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-skill-sheet-modern.hbs',
            scrollable: ['.wh40k-item-body'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add any additional context data needed for the skill sheet
        // None needed currently - all data comes from DataModel

        return context;
    }
}
