/**
 * @file Game-system character sheet variants
 * Each game line gets a subclass of CharacterSheet that differs only in its
 * CSS class, header template, and system-specific config (e.g. skill ranks).
 * All core logic lives in CharacterSheet.
 */

import CharacterSheet from './character-sheet.ts';

const HEADER = 'systems/wh40k-rpg/templates/actor/player/';

/** DH2e skill ranks: Known (+0) / Trained (+10) / Experienced (+20) / Veteran (+30) */
const DH2E_SKILL_TRAINING = [
    { level: 1, key: 'trained', label: 'Kn', tooltip: 'Known',       bonus: 0  },
    { level: 2, key: 'plus10',  label: 'Tr', tooltip: 'Trained',     bonus: 10 },
    { level: 3, key: 'plus20',  label: 'Ex', tooltip: 'Experienced', bonus: 20 },
    { level: 4, key: 'plus30',  label: 'Ve', tooltip: 'Veteran',     bonus: 30 },
];

interface SystemSheetOptions {
    skillTraining?: Array<{level: number; key: string; label: string; tooltip: string; bonus: number}>;
}

function makeSystemSheet(className: string, cssClass: string, headerFile: string, opts: SystemSheetOptions = {}) {
    const BASE = CharacterSheet as any;
    const cls = class extends CharacterSheet {
        static DEFAULT_OPTIONS = {
            ...BASE.DEFAULT_OPTIONS,
            classes: [...(BASE.DEFAULT_OPTIONS?.classes ?? []), cssClass],
        };
        static PARTS = {
            ...BASE.PARTS,
            header: { template: HEADER + headerFile },
        };
    };
    if (opts.skillTraining) {
        const config = opts.skillTraining;
        cls.prototype._getSkillTrainingConfig = function() { return config; };
    }
    Object.defineProperty(cls, 'name', { value: className });
    return cls;
}

export const DarkHeresy2Sheet = makeSystemSheet('DarkHeresy2Sheet', 'dark-heresy',    'header-dh.hbs', { skillTraining: DH2E_SKILL_TRAINING });
export const RogueTraderSheet  = makeSystemSheet('RogueTraderSheet',  'rogue-trader',  'header-rt.hbs');
export const BlackCrusadeSheet = makeSystemSheet('BlackCrusadeSheet', 'black-crusade', 'header-bc.hbs');
export const OnlyWarSheet      = makeSystemSheet('OnlyWarSheet',      'only-war',      'header-ow.hbs');
export const DeathwatchSheet   = makeSystemSheet('DeathwatchSheet',   'deathwatch',    'header-dw.hbs');
export const DarkHeresy1Sheet  = makeSystemSheet('DarkHeresy1Sheet',  'dark-heresy-1e','header-dh1.hbs');
