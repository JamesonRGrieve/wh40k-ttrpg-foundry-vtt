/**
 * @file OnlyWarSheet - Only War character sheet
 * Extends the base CharacterSheet with OW-specific header fields
 * (Home World, Regiment, Speciality, Demeanour).
 */

import CharacterSheet from './character-sheet.ts';

export default class OnlyWarSheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'only-war'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/player/header-ow.hbs',
        },
    };
}
