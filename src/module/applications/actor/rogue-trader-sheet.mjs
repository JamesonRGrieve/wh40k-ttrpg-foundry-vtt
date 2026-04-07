/**
 * @file RogueTraderSheet - Rogue Trader character sheet
 * Extends the base AcolyteSheet with RT-specific header fields
 * (Home World, Career, Rank) and dynasty tab.
 */

import CharacterSheet from './character-sheet.mjs';

export default class RogueTraderSheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'rogue-trader'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/player/header-rt.hbs',
        },
    };
}
