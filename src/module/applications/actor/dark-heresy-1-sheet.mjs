/**
 * @file DarkHeresy1Sheet - Dark Heresy 1e character sheet
 * Extends the base CharacterSheet with DH1e-specific header fields
 * (Home World, Career Path, Rank, Divination).
 */

import CharacterSheet from './character-sheet.mjs';

export default class DarkHeresy1Sheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'dark-heresy-1e'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/header-dh1.hbs',
        },
    };
}
