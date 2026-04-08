/**
 * @file Game-system character sheet variants
 * Each game line gets a subclass of CharacterSheet that differs only in its
 * CSS class and header template. All logic lives in CharacterSheet.
 */

import CharacterSheet from './character-sheet.ts';

const HEADER = 'systems/wh40k-rpg/templates/actor/player/';

function makeSystemSheet(cssClass: string, headerFile: string) {
    const BASE = CharacterSheet as any;
    return class extends CharacterSheet {
        static DEFAULT_OPTIONS = {
            ...BASE.DEFAULT_OPTIONS,
            classes: [...(BASE.DEFAULT_OPTIONS?.classes ?? []), cssClass],
        };
        static PARTS = {
            ...BASE.PARTS,
            header: { template: HEADER + headerFile },
        };
    };
}

export const DarkHeresy2Sheet = makeSystemSheet('dark-heresy',   'header-dh.hbs');
export const RogueTraderSheet  = makeSystemSheet('rogue-trader',  'header-rt.hbs');
export const BlackCrusadeSheet = makeSystemSheet('black-crusade', 'header-bc.hbs');
export const OnlyWarSheet      = makeSystemSheet('only-war',      'header-ow.hbs');
export const DeathwatchSheet   = makeSystemSheet('deathwatch',    'header-dw.hbs');
export const DarkHeresy1Sheet  = makeSystemSheet('dark-heresy-1e','header-dh1.hbs');
