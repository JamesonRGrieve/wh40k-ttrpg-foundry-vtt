/**
 * @file Per-game-system sheet variants.
 *
 * Each game line (DH1, DH2, OW, BC, RT, DW, IM) gets TWO concrete sheets that
 * share a system config (CSS class + header template + skill-rank labels):
 *
 *     CharacterSheet
 *     ├── DarkHeresy2PlayerSheet  (for `character` actors in a DH2 world)
 *     └── (PC variants for RT / OW / BC / DW / DH1)
 *
 *     NPCSheet  (extends CharacterSheet)
 *     ├── DarkHeresy2NPCSheet     (for `npc` actors in a DH2 world)
 *     └── (NPC variants for RT / OW / BC / DW / DH1)
 *
 * The factories below generate both halves from the same config so a single
 * touch to a system's CSS class or skill ranks updates its PC and NPC sheets
 * in lock-step.
 *
 * `DarkHeresy2Sheet` (and friends) remain exported as aliases for their
 * `…PlayerSheet` counterparts so existing `flags.core.sheetClass` values on
 * player actors keep resolving without a world migration.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { GameSystemId } from '../../config/game-systems/types.ts';
import CharacterSheet from './character-sheet.ts';
import NPCSheet from './npc-sheet.ts';
import StarshipSheet from './starship-sheet.ts';
import VehicleSheet from './vehicle-sheet.ts';

const HEADER = 'systems/wh40k-rpg/templates/actor/player/';

interface SystemSheetConfig {
    cssClass: string;
    headerFile: string;
    gameSystemId: GameSystemId;
}

type SkillRanks = ReturnType<ReturnType<typeof SystemConfigRegistry.get>['getSkillRanks']>;

interface SystemVariantBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript mixin requirement: must accept any[] for `class extends baseCls`
    new (...args: any[]): object;
    DEFAULT_OPTIONS?: Partial<ApplicationV2Config.DefaultOptions>;
    PARTS: Record<string, { template?: string }>;
}

/**
 * Build a concrete sheet class on top of a base (CharacterSheet or NPCSheet),
 * adding the system's CSS class, header template, and skill-rank config.
 */
function makeSystemVariant<TBase extends SystemVariantBase>(baseCls: TBase, className: string, cfg: SystemSheetConfig): TBase {
    const cls = class extends baseCls {
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            ...baseCls.DEFAULT_OPTIONS,
            classes: [...(baseCls.DEFAULT_OPTIONS?.classes ?? []), cfg.cssClass],
        };
        static PARTS = {
            ...baseCls.PARTS,
            header: { ...baseCls.PARTS.header, template: HEADER + cfg.headerFile },
        };
    };
    const systemConfig = SystemConfigRegistry.get(cfg.gameSystemId);
    const skillRanks = systemConfig.getSkillRanks();
    const proto = cls.prototype as { _getSkillTrainingConfig?: () => SkillRanks; _gameSystemId?: GameSystemId };
    proto._getSkillTrainingConfig = function () {
        return skillRanks;
    };
    proto._gameSystemId = cfg.gameSystemId;
    Object.defineProperty(cls, 'name', { value: className });
    return cls;
}

const SYSTEMS: Array<[string, SystemSheetConfig]> = [
    ['DarkHeresy2', { cssClass: 'dark-heresy', headerFile: 'header-dh.hbs', gameSystemId: 'dh2e' }],
    ['RogueTrader', { cssClass: 'rogue-trader', headerFile: 'header-dh.hbs', gameSystemId: 'rt' }],
    ['BlackCrusade', { cssClass: 'black-crusade', headerFile: 'header-dh.hbs', gameSystemId: 'bc' }],
    ['OnlyWar', { cssClass: 'only-war', headerFile: 'header-dh.hbs', gameSystemId: 'ow' }],
    ['Deathwatch', { cssClass: 'deathwatch', headerFile: 'header-dh.hbs', gameSystemId: 'dw' }],
    ['DarkHeresy1', { cssClass: 'dark-heresy-1e', headerFile: 'header-dh.hbs', gameSystemId: 'dh1e' }],
    ['ImperiumMaledictum', { cssClass: 'imperium-maledictum', headerFile: 'header-dh.hbs', gameSystemId: 'im' }],
];

// -- Player sheets (extend CharacterSheet) ---------------------------------

export const DarkHeresy2PlayerSheet = makeSystemVariant(CharacterSheet, 'DarkHeresy2PlayerSheet', SYSTEMS[0][1]);
export const RogueTraderPlayerSheet = makeSystemVariant(CharacterSheet, 'RogueTraderPlayerSheet', SYSTEMS[1][1]);
export const BlackCrusadePlayerSheet = makeSystemVariant(CharacterSheet, 'BlackCrusadePlayerSheet', SYSTEMS[2][1]);
export const OnlyWarPlayerSheet = makeSystemVariant(CharacterSheet, 'OnlyWarPlayerSheet', SYSTEMS[3][1]);
export const DeathwatchPlayerSheet = makeSystemVariant(CharacterSheet, 'DeathwatchPlayerSheet', SYSTEMS[4][1]);
export const DarkHeresy1PlayerSheet = makeSystemVariant(CharacterSheet, 'DarkHeresy1PlayerSheet', SYSTEMS[5][1]);
export const ImperiumMaledictumPlayerSheet = makeSystemVariant(CharacterSheet, 'ImperiumMaledictumPlayerSheet', SYSTEMS[6][1]);

// -- NPC sheets (extend NPCSheet, which itself extends CharacterSheet) -----

export const DarkHeresy2NPCSheet = makeSystemVariant(NPCSheet, 'DarkHeresy2NPCSheet', SYSTEMS[0][1]);
export const RogueTraderNPCSheet = makeSystemVariant(NPCSheet, 'RogueTraderNPCSheet', SYSTEMS[1][1]);
export const BlackCrusadeNPCSheet = makeSystemVariant(NPCSheet, 'BlackCrusadeNPCSheet', SYSTEMS[2][1]);
export const OnlyWarNPCSheet = makeSystemVariant(NPCSheet, 'OnlyWarNPCSheet', SYSTEMS[3][1]);
export const DeathwatchNPCSheet = makeSystemVariant(NPCSheet, 'DeathwatchNPCSheet', SYSTEMS[4][1]);
export const DarkHeresy1NPCSheet = makeSystemVariant(NPCSheet, 'DarkHeresy1NPCSheet', SYSTEMS[5][1]);
export const ImperiumMaledictumNPCSheet = makeSystemVariant(NPCSheet, 'ImperiumMaledictumNPCSheet', SYSTEMS[6][1]);

// -- Vehicle sheets (extend VehicleSheet) ---------------------------------

export const DarkHeresy2VehicleSheet = makeSystemVariant(VehicleSheet, 'DarkHeresy2VehicleSheet', SYSTEMS[0][1]);
export const RogueTraderVehicleSheet = makeSystemVariant(VehicleSheet, 'RogueTraderVehicleSheet', SYSTEMS[1][1]);
export const BlackCrusadeVehicleSheet = makeSystemVariant(VehicleSheet, 'BlackCrusadeVehicleSheet', SYSTEMS[2][1]);
export const OnlyWarVehicleSheet = makeSystemVariant(VehicleSheet, 'OnlyWarVehicleSheet', SYSTEMS[3][1]);
export const DeathwatchVehicleSheet = makeSystemVariant(VehicleSheet, 'DeathwatchVehicleSheet', SYSTEMS[4][1]);
export const DarkHeresy1VehicleSheet = makeSystemVariant(VehicleSheet, 'DarkHeresy1VehicleSheet', SYSTEMS[5][1]);
export const ImperiumMaledictumVehicleSheet = makeSystemVariant(VehicleSheet, 'ImperiumMaledictumVehicleSheet', SYSTEMS[6][1]);

// -- Starship sheets (extend StarshipSheet) -------------------------------
// Only RT ships starships. Factory leaves room for other systems.

export const RogueTraderStarshipSheet = makeSystemVariant(StarshipSheet, 'RogueTraderStarshipSheet', SYSTEMS[1][1]);

// -- Back-compat aliases ---------------------------------------------------
// `DarkHeresy2Sheet` (etc.) was the PC sheet export name before the split.
// Keep the aliases so existing `flags.core.sheetClass = 'wh40k-rpg.DarkHeresy2Sheet'`
// values on player actors keep resolving without a world migration.

export const DarkHeresy2Sheet = DarkHeresy2PlayerSheet;
export const RogueTraderSheet = RogueTraderPlayerSheet;
export const BlackCrusadeSheet = BlackCrusadePlayerSheet;
export const OnlyWarSheet = OnlyWarPlayerSheet;
export const DeathwatchSheet = DeathwatchPlayerSheet;
export const DarkHeresy1Sheet = DarkHeresy1PlayerSheet;
export const ImperiumMaledictumSheet = ImperiumMaledictumPlayerSheet;
