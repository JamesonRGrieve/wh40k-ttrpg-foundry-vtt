/**
 * @file DeathwatchSheet - Deathwatch character sheet
 * Extends the base CharacterSheet with DW-specific header fields
 * (Chapter, Speciality, Rank, Demeanour).
 */

import CharacterSheet from './character-sheet.ts';

export default class DeathwatchSheet extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        classes: [...super.DEFAULT_OPTIONS.classes, 'deathwatch'],
    };

    /** @override */
    static PARTS = {
        ...super.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/player/header-dw.hbs',
        },
    };
}
