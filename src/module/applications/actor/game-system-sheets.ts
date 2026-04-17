/**
 * @file Game-system character sheet variants
 * Each game line gets a subclass of CharacterSheet that differs only in its
 * CSS class, header template, and system-specific config (e.g. skill ranks).
 * All core logic lives in CharacterSheet.
 *
 * Skill training configs are now sourced from the SystemConfigRegistry.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { GameSystemId } from '../../config/game-systems/types.ts';
import CharacterSheet from './character-sheet.ts';

const HEADER = 'systems/wh40k-rpg/templates/actor/player/';

interface SystemSheetOptions {
    gameSystemId: GameSystemId;
}

function makeSystemSheet(className: string, cssClass: string, headerFile: string, opts: SystemSheetOptions): any {
    const BASE = CharacterSheet as typeof CharacterSheet & { DEFAULT_OPTIONS: Record<string, unknown> };
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
    // System config sourced from the registry
    const systemConfig = SystemConfigRegistry.get(opts.gameSystemId);
    const skillRanks = systemConfig.getSkillRanks();
    cls.prototype._getSkillTrainingConfig = function () {
        return skillRanks;
    };
    cls.prototype._gameSystemId = opts.gameSystemId;
    Object.defineProperty(cls, 'name', { value: className });
    return cls;
}

export const DarkHeresy2Sheet = makeSystemSheet('DarkHeresy2Sheet', 'dark-heresy', 'header-dh.hbs', { gameSystemId: 'dh2e' });
export const RogueTraderSheet = makeSystemSheet('RogueTraderSheet', 'rogue-trader', 'header-rt.hbs', { gameSystemId: 'rt' });
export const BlackCrusadeSheet = makeSystemSheet('BlackCrusadeSheet', 'black-crusade', 'header-bc.hbs', { gameSystemId: 'bc' });
export const OnlyWarSheet = makeSystemSheet('OnlyWarSheet', 'only-war', 'header-ow.hbs', { gameSystemId: 'ow' });
export const DeathwatchSheet = makeSystemSheet('DeathwatchSheet', 'deathwatch', 'header-dw.hbs', { gameSystemId: 'dw' });
export const DarkHeresy1Sheet = makeSystemSheet('DarkHeresy1Sheet', 'dark-heresy-1e', 'header-dh1.hbs', { gameSystemId: 'dh1e' });
