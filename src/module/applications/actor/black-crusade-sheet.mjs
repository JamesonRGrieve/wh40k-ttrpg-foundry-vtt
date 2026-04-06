/**
 * @file BlackCrusadeSheet - Black Crusade character sheet
 * Extends the base CharacterSheet with BC-specific header fields
 * (Home World, Archetype, Pride, Disgrace, Motivation).
 */

import CharacterSheet from './character-sheet.mjs';

export default class BlackCrusadeSheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'black-crusade'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/header-bc.hbs',
        },
    };
}
