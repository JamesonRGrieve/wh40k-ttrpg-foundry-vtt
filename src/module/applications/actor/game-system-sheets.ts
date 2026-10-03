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
import CraftActorSheet from './craft-sheet.ts';
import NPCSheet from './npc-sheet.ts';
import VoidcraftActorSheet from './voidcraft-sheet.ts';

const HEADER = 'systems/wh40k-rpg/templates/actor/player/';

interface SystemSheetConfig {
    cssClass: string;
    headerFile: string;
    gameSystemId: GameSystemId;
}

type SkillRanks = ReturnType<ReturnType<typeof SystemConfigRegistry.get>['getSkillRanks']>;

interface SystemVariantBase {
    /* eslint-disable @typescript-eslint/no-explicit-any -- TypeScript mixin requirement: must accept any[] for `class extends baseCls` */
    // biome-ignore lint/suspicious/noExplicitAny: TypeScript mixin requirement: must accept any[] for `class extends baseCls`
    new (...args: any[]): object;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    DEFAULT_OPTIONS?: Partial<ApplicationV2Config.DefaultOptions>;
    PARTS: Record<string, { template?: string }>;
}

/**
 * Which sidebar header a sheet family renders: the line's player header (PC and
 * NPC sheets), or the base class's own (craft and voidcraft headers carry hull,
 * locomotion and quick-stat fields a player header has no slot for).
 */
type HeaderSource = 'line-player-header' | 'own-header';

/**
 * Build a concrete sheet class on top of a base sheet, adding the system's CSS
 * class, skill-rank config and — for PC/NPC families only — the line's header.
 */
function makeSystemVariant<TBase extends SystemVariantBase>(baseCls: TBase, className: string, cfg: SystemSheetConfig, headerSource: HeaderSource): TBase {
    const header = headerSource === 'line-player-header' ? { ...baseCls.PARTS['header'], template: HEADER + cfg.headerFile } : baseCls.PARTS['header'];
    const cls = class extends baseCls {
        static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            ...baseCls.DEFAULT_OPTIONS,
            classes: [...(baseCls.DEFAULT_OPTIONS?.classes ?? []), cfg.cssClass],
        };
        static override PARTS = { ...baseCls.PARTS, header };
    };
    const systemConfig = SystemConfigRegistry.get(cfg.gameSystemId);
    const proto = cls.prototype as { _getSkillTrainingConfig?: () => SkillRanks; _gameSystemId?: GameSystemId };
    // Resolved per render: the langpack is not loaded yet when sheet classes are defined.
    proto._getSkillTrainingConfig = () => systemConfig.getLocalizedSkillRanks();
    proto._gameSystemId = cfg.gameSystemId;
    Object.defineProperty(cls, 'name', { value: className });
    return cls;
}

const SYSTEMS: Record<GameSystemId, SystemSheetConfig> = {
    dh2: { cssClass: 'dark-heresy', headerFile: 'header-dh.hbs', gameSystemId: 'dh2' },
    rt: { cssClass: 'rogue-trader', headerFile: 'header-rt.hbs', gameSystemId: 'rt' },
    bc: { cssClass: 'black-crusade', headerFile: 'header-dh.hbs', gameSystemId: 'bc' },
    ow: { cssClass: 'only-war', headerFile: 'header-dh.hbs', gameSystemId: 'ow' },
    dw: { cssClass: 'deathwatch', headerFile: 'header-dh.hbs', gameSystemId: 'dw' },
    dh1: { cssClass: 'dark-heresy-1e', headerFile: 'header-dh.hbs', gameSystemId: 'dh1' },
    im: { cssClass: 'imperium-maledictum', headerFile: 'header-dh.hbs', gameSystemId: 'im' },
};

// -- Player sheets (extend CharacterSheet) ---------------------------------

export const DarkHeresy2PlayerSheet = makeSystemVariant(CharacterSheet, 'DarkHeresy2PlayerSheet', SYSTEMS.dh2, 'line-player-header');
export const RogueTraderPlayerSheet = makeSystemVariant(CharacterSheet, 'RogueTraderPlayerSheet', SYSTEMS.rt, 'line-player-header');
export const BlackCrusadePlayerSheet = makeSystemVariant(CharacterSheet, 'BlackCrusadePlayerSheet', SYSTEMS.bc, 'line-player-header');
export const OnlyWarPlayerSheet = makeSystemVariant(CharacterSheet, 'OnlyWarPlayerSheet', SYSTEMS.ow, 'line-player-header');
export const DeathwatchPlayerSheet = makeSystemVariant(CharacterSheet, 'DeathwatchPlayerSheet', SYSTEMS.dw, 'line-player-header');
export const DarkHeresy1PlayerSheet = makeSystemVariant(CharacterSheet, 'DarkHeresy1PlayerSheet', SYSTEMS.dh1, 'line-player-header');
export const ImperiumMaledictumPlayerSheet = makeSystemVariant(CharacterSheet, 'ImperiumMaledictumPlayerSheet', SYSTEMS.im, 'line-player-header');

// -- NPC sheets (extend NPCSheet, which itself extends CharacterSheet) -----

export const DarkHeresy2NPCSheet = makeSystemVariant(NPCSheet, 'DarkHeresy2NPCSheet', SYSTEMS.dh2, 'line-player-header');
export const RogueTraderNPCSheet = makeSystemVariant(NPCSheet, 'RogueTraderNPCSheet', SYSTEMS.rt, 'line-player-header');
export const BlackCrusadeNPCSheet = makeSystemVariant(NPCSheet, 'BlackCrusadeNPCSheet', SYSTEMS.bc, 'line-player-header');
export const OnlyWarNPCSheet = makeSystemVariant(NPCSheet, 'OnlyWarNPCSheet', SYSTEMS.ow, 'line-player-header');
export const DeathwatchNPCSheet = makeSystemVariant(NPCSheet, 'DeathwatchNPCSheet', SYSTEMS.dw, 'line-player-header');
export const DarkHeresy1NPCSheet = makeSystemVariant(NPCSheet, 'DarkHeresy1NPCSheet', SYSTEMS.dh1, 'line-player-header');
export const ImperiumMaledictumNPCSheet = makeSystemVariant(NPCSheet, 'ImperiumMaledictumNPCSheet', SYSTEMS.im, 'line-player-header');

// -- Craft sheets (terracraft / aircraft / watercraft — extend CraftActorSheet) ---
// One per-line craft sheet variant; registered for that line's terracraft/aircraft/watercraft types.

export const DarkHeresy2CraftSheet = makeSystemVariant(CraftActorSheet, 'DarkHeresy2CraftSheet', SYSTEMS.dh2, 'own-header');
export const RogueTraderCraftSheet = makeSystemVariant(CraftActorSheet, 'RogueTraderCraftSheet', SYSTEMS.rt, 'own-header');
export const BlackCrusadeCraftSheet = makeSystemVariant(CraftActorSheet, 'BlackCrusadeCraftSheet', SYSTEMS.bc, 'own-header');
export const OnlyWarCraftSheet = makeSystemVariant(CraftActorSheet, 'OnlyWarCraftSheet', SYSTEMS.ow, 'own-header');
export const DeathwatchCraftSheet = makeSystemVariant(CraftActorSheet, 'DeathwatchCraftSheet', SYSTEMS.dw, 'own-header');
export const DarkHeresy1CraftSheet = makeSystemVariant(CraftActorSheet, 'DarkHeresy1CraftSheet', SYSTEMS.dh1, 'own-header');
export const ImperiumMaledictumCraftSheet = makeSystemVariant(CraftActorSheet, 'ImperiumMaledictumCraftSheet', SYSTEMS.im, 'own-header');

// -- Voidcraft sheets (extend VoidcraftActorSheet) ------------------------
// Only RT fields voidcraft. Factory leaves room for other systems.

export const RogueTraderVoidcraftSheet = makeSystemVariant(VoidcraftActorSheet, 'RogueTraderVoidcraftSheet', SYSTEMS.rt, 'own-header');

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
