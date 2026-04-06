/**
 * @file DarkHeresySheet - Dark Heresy 2e character sheet
 * Extends the base AcolyteSheet with DH2e-specific header fields
 * (Home World, Background, Role, Elite Advance, Divination).
 */

import CharacterSheet from './character-sheet.mjs';

export default class DarkHeresySheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'dark-heresy'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/header-dh.hbs',
        },
    };
}
