import { ALL_SYSTEM_IDS, type GameSystemId } from './config/game-systems/types.ts';
import type { EventTrackerSettingTypes } from './managers/event-tracker.ts';
import { type CombatPreset, isCombatPresetList } from './rules/combat-presets.ts';
import type { FatigueMode } from './rules/fatigue.ts';
import { type ImperialDate, parseImperialDate } from './rules/imperial-date.ts';
import { type InquestState, parseInquests } from './rules/inquest.ts';
import { type CelestialBodies, parseCelestialBodies } from './rules/scene-lighting.ts';
import type { TokenImageGenConfig, TokenImageGenMode } from './rules/token-image-gen.ts';
import { type LastAdvance, parseLastAdvance } from './rules/world-time-undo.ts';
import type { I18nKey } from './types/i18n-keys';
import {
    booleanSetting,
    choiceSetting,
    jsonSetting,
    numberSetting,
    readJsonSetting,
    readSetting,
    registerSettingTable,
    settingKeys,
    type SettingValueTypes,
    stringSetting,
    arraySetting,
    writeSetting,
} from './utils/setting-table.ts';

export type DH2Ruleset = 'raw' | 'homebrew';

/** Degrees-of-success calculation mode. `raw` resolves per game system; the
 * other two force one method across all systems. */
export type DegreesMode = 'raw' | 'gen1' | 'gen2';

/** Default attack-cue volume (#594), 0–1. */
const ATTACK_CUE_VOLUME_DEFAULT = 0.8;

/** Default status-visual intensity scale (#595), 0–1. */
const STATUS_VISUAL_INTENSITY_DEFAULT = 1;

/**
 * Default Infamy a Black Crusade champion needs for apotheosis rather than
 * spawndom when Corruption reaches 100 (BC rules). The book leaves the
 * threshold to the GM (suggesting 75, 90 or 100); 100 is the default.
 */
const APOTHEOSIS_INFAMY_THRESHOLD_DEFAULT = 100;

/** Floor/ceiling of the warband Subtlety pool (#64). RAW DH2: 0–100. */
const WARBAND_SUBTLETY_MAX = 100;
const WARBAND_SUBTLETY_DEFAULT = 60;

/** Default campaign-inception world-time stamp (#487): 0 = the world's own
 *  epoch. Day 0 is the campaign/mission inception and is fixed, not
 *  re-anchorable from the widget. */
const WORLD_TIME_INCEPTION_DEFAULT = 0;

/**
 * Neutral placeholder for the campaign-inception Imperial timestamp (#487).
 *
 * Deliberately NOT any real campaign's date: which date a campaign began on is
 * **world data**, set per world by its GM, not something the system ships. This
 * default exists only so an unconfigured world renders a well-formed stamp
 * instead of blank.
 */
const CAMPAIGN_INCEPTION_DATE_DEFAULT = '0.000.001.M41';

/** The primary game line's choice labels, in `ALL_SYSTEM_IDS` order. */
const PRIMARY_GAME_SYSTEM_CHOICES: Readonly<Record<GameSystemId, I18nKey>> = {
    rt: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.rt',
    dh1: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dh1',
    dh2: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dh2',
    bc: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.bc',
    ow: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.ow',
    dw: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dw',
    im: 'WH40K.SETTINGS.PrimaryGameSystem.Choices.im',
};

/** Re-render the sheets that show the warband Subtlety pool and Inquests (#64, #90). */
function rerenderSubtletyDependentSheets(): void {
    WH40KSettings.rerenderSubtletyDependentSheets();
}

/**
 * Every system setting, in registration order (#299, #712). The order, and each
 * entry's key / scope / config / requiresReload / default / type / choice keys,
 * is load-bearing for migrations and pinned by the structural-shape snapshot in
 * `wh40k-rpg-settings.test.ts`. `name` / `hint` (and choice values) are
 * WH40K.SETTINGS.* langpack keys Foundry localizes at render time.
 */
const SETTINGS_TABLE = {
    worldVersion: numberSetting({
        key: 'world-version',
        name: 'WH40K.SETTINGS.WorldVersion.Name',
        hint: 'WH40K.SETTINGS.WorldVersion.Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        default: 1,
    }),
    processActiveEffectsDuringCombat: booleanSetting({
        key: 'active-effects-during-combat',
        name: 'WH40K.SETTINGS.ProcessActiveEffectsDuringCombat.Name',
        hint: 'WH40K.SETTINGS.ProcessActiveEffectsDuringCombat.Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        default: true,
    }),
    simpleAttackRolls: booleanSetting({
        key: 'simple-attack-rolls',
        name: 'WH40K.SETTINGS.SimpleAttackRolls.Name',
        hint: 'WH40K.SETTINGS.SimpleAttackRolls.Hint',
        scope: 'client',
        config: true,
        requiresReload: true,
        default: false,
    }),
    simplePsychicRolls: booleanSetting({
        key: 'simple-psychic-rolls',
        name: 'WH40K.SETTINGS.SimplePsychicRolls.Name',
        hint: 'WH40K.SETTINGS.SimplePsychicRolls.Hint',
        scope: 'client',
        config: true,
        requiresReload: true,
        default: false,
    }),
    autoPsychicPhenomena: booleanSetting({
        key: 'auto-psychic-phenomena',
        name: 'WH40K.SETTINGS.AutoPsychicPhenomena.Name',
        hint: 'WH40K.SETTINGS.AutoPsychicPhenomena.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    autoRollDamage: booleanSetting({
        key: 'auto-roll-damage',
        name: 'WH40K.SETTINGS.AutoRollDamage.Name',
        hint: 'WH40K.SETTINGS.AutoRollDamage.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    autoApplyDamage: booleanSetting({
        key: 'auto-apply-damage',
        name: 'WH40K.SETTINGS.AutoApplyDamage.Name',
        hint: 'WH40K.SETTINGS.AutoApplyDamage.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    magazineBuilding: booleanSetting({
        key: 'magazine-building',
        name: 'WH40K.SETTINGS.MagazineBuilding.Name',
        hint: 'WH40K.SETTINGS.MagazineBuilding.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    standardAmmoTracking: booleanSetting({
        key: 'standard-ammo-tracking',
        name: 'WH40K.SETTINGS.StandardAmmoTracking.Name',
        hint: 'WH40K.SETTINGS.StandardAmmoTracking.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    requireCombatToAttack: booleanSetting({
        key: 'require-combat-to-attack',
        name: 'WH40K.SETTINGS.RequireCombatToAttack.Name',
        hint: 'WH40K.SETTINGS.RequireCombatToAttack.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    combatPresets: arraySetting({
        key: 'combat-presets',
        name: 'WH40K.SETTINGS.CombatPresets.Name',
        hint: 'WH40K.SETTINGS.CombatPresets.Hint',
        scope: 'world',
        config: false,
        default: [] as CombatPreset[],
        accept: isCombatPresetList,
    }),
    primaryGameSystem: choiceSetting({
        key: 'primary-game-system',
        name: 'WH40K.SETTINGS.PrimaryGameSystem.Name',
        hint: 'WH40K.SETTINGS.PrimaryGameSystem.Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        default: 'dh2',
        choices: PRIMARY_GAME_SYSTEM_CHOICES,
    }),
    dh2Ruleset: choiceSetting({
        key: 'dh2-ruleset',
        name: 'WH40K.SETTINGS.DH2Ruleset.Name',
        hint: 'WH40K.SETTINGS.DH2Ruleset.Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        default: 'homebrew',
        choices: {
            homebrew: 'WH40K.SETTINGS.DH2Ruleset.Choices.Homebrew',
            raw: 'WH40K.SETTINGS.DH2Ruleset.Choices.Raw',
        },
    }),
    degreesMode: choiceSetting({
        key: 'degrees-mode',
        name: 'WH40K.SETTINGS.DegreesMode.Name',
        hint: 'WH40K.SETTINGS.DegreesMode.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'raw',
        choices: {
            raw: 'WH40K.SETTINGS.DegreesMode.Choices.Raw',
            gen1: 'WH40K.SETTINGS.DegreesMode.Choices.Gen1',
            gen2: 'WH40K.SETTINGS.DegreesMode.Choices.Gen2',
        },
    }),
    fatigueMode: choiceSetting({
        key: 'fatigue-mode',
        name: 'WH40K.SETTINGS.FatigueMode.Name',
        hint: 'WH40K.SETTINGS.FatigueMode.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'auto',
        choices: {
            auto: 'WH40K.SETTINGS.FatigueMode.Choices.Auto',
            halving: 'WH40K.SETTINGS.FatigueMode.Choices.Halving',
            flat: 'WH40K.SETTINGS.FatigueMode.Choices.Flat',
            condition: 'WH40K.SETTINGS.FatigueMode.Choices.Condition',
        },
    }),
    promptIncompleteOriginPath: booleanSetting({
        key: 'prompt-incomplete-origin-path',
        name: 'WH40K.SETTINGS.PromptIncompleteOriginPath.Name',
        hint: 'WH40K.SETTINGS.PromptIncompleteOriginPath.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: true,
    }),
    freeformCharacters: booleanSetting({
        key: 'freeform-characters',
        name: 'WH40K.SETTINGS.FreeformCharacters.Name',
        hint: 'WH40K.SETTINGS.FreeformCharacters.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    // Gates the "Drop to Add" dropzone on the Talents and Traits panels
    // (#396). When disabled (default) those panels hide the dropzone so
    // talents/traits go through the structured advancement/XP flow rather
    // than being added by free drag-and-drop.
    freeformCreation: booleanSetting({
        key: 'freeform-creation',
        name: 'WH40K.SETTINGS.FreeformCreation.Name',
        hint: 'WH40K.SETTINGS.FreeformCreation.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    // Homebrew self-target treatment (#393): point-blank range + skip
    // enemy-defence situationals (size/cover/target-state) when you target
    // yourself. Off = RAW self-targeting.
    homebrewSelfTargeting: booleanSetting({
        key: 'homebrew-self-targeting',
        name: 'WH40K.SETTINGS.HomebrewSelfTargeting.Name',
        hint: 'WH40K.SETTINGS.HomebrewSelfTargeting.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    // Homebrew roll-twice-keep-one modes on d100 tests. Off = RAW.
    rollKeepModes: booleanSetting({
        key: 'roll-keep-modes',
        name: 'WH40K.SETTINGS.RollKeepModes.Name',
        hint: 'WH40K.SETTINGS.RollKeepModes.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    // Minimum elevation delta before RAW Higher Ground applies
    // (#407). Default 0 = RAW: strictly above is higher ground.
    // Raising it stops a crate or a half-step of rubble from
    // granting the +10, and on a Levels map a band below the floor
    // height still lets a genuine storey qualify.
    highGroundBand: numberSetting({
        key: 'high-ground-band',
        name: 'WH40K.SETTINGS.HighGroundBand.Name',
        hint: 'WH40K.SETTINGS.HighGroundBand.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 0,
    }),
    // Auto line-of-sight + full/half cover from scene walls (#406).
    // Off by default until the canvas geometry is verified on real scenes.
    autoCoverLos: booleanSetting({
        key: 'auto-cover-los',
        name: 'WH40K.SETTINGS.AutoCoverLos.Name',
        hint: 'WH40K.SETTINGS.AutoCoverLos.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    // Homebrew Awareness sense-split (#440): resolve Awareness per sense
    // channel and re-scope the auspex bonus to Visual only. Off = RAW.
    awarenessSenseSplit: booleanSetting({
        key: 'awareness-sense-split',
        name: 'WH40K.SETTINGS.AwarenessSenseSplit.Name',
        hint: 'WH40K.SETTINGS.AwarenessSenseSplit.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: false,
    }),
    characteristicOffset: numberSetting({
        key: 'characteristic-offset',
        name: 'WH40K.SETTINGS.CharacteristicOffset.Name',
        hint: 'WH40K.SETTINGS.CharacteristicOffset.Hint',
        scope: 'world',
        config: true,
        default: 0,
    }),
    pointBuyPool: numberSetting({
        key: 'point-buy-pool',
        name: 'WH40K.SETTINGS.PointBuyPool.Name',
        hint: 'WH40K.SETTINGS.PointBuyPool.Hint',
        scope: 'world',
        config: true,
        // DH2e point-buy allocates 60 points over the base values (#223).
        default: 60,
    }),
    movementAutomation: choiceSetting({
        key: 'movement-automation',
        name: 'WH40K.SETTINGS.MovementAutomation.Name',
        hint: 'WH40K.SETTINGS.MovementAutomation.Hint',
        scope: 'world',
        config: true,
        default: 'full',
        choices: {
            full: 'WH40K.SETTINGS.MovementAutomation.Full',
            display: 'WH40K.SETTINGS.MovementAutomation.Display',
            none: 'WH40K.SETTINGS.MovementAutomation.None',
        },
    }),
    multipleFateBurnPerRoll: booleanSetting({
        key: 'multiple-fate-burn-per-roll',
        name: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Name',
        hint: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    resyncOnReady: booleanSetting({
        key: 'resync-on-ready',
        name: 'WH40K.SETTINGS.ResyncOnReady.Name',
        hint: 'WH40K.SETTINGS.ResyncOnReady.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    deathLootPiles: booleanSetting({
        key: 'death-loot-piles',
        name: 'WH40K.SETTINGS.DeathLootPiles.Name',
        hint: 'WH40K.SETTINGS.DeathLootPiles.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    npcAdvancement: booleanSetting({
        key: 'npc-advancement',
        name: 'WH40K.SETTINGS.NpcAdvancement.Name',
        hint: 'WH40K.SETTINGS.NpcAdvancement.Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        default: false,
    }),
    compendiumDropImportsActor: booleanSetting({
        key: 'compendium-drop-imports-actor',
        name: 'WH40K.SETTINGS.CompendiumDropImportsActor.Name',
        hint: 'WH40K.SETTINGS.CompendiumDropImportsActor.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    celestialBodies: jsonSetting({
        key: 'celestial-bodies',
        name: 'WH40K.SETTINGS.CelestialBodies.Name',
        hint: 'WH40K.SETTINGS.CelestialBodies.Hint',
        scope: 'world',
        config: false,
        default: '{}',
        parse: parseCelestialBodies,
        empty: {},
    }),
    allowManualRoll: booleanSetting({
        key: 'allow-manual-roll',
        name: 'WH40K.SETTINGS.AllowManualRoll.Name',
        hint: 'WH40K.SETTINGS.AllowManualRoll.Hint',
        scope: 'world',
        config: true,
        default: false,
    }),
    reconcileOriginGrantsOnReady: booleanSetting({
        key: 'reconcile-origin-grants-on-ready',
        name: 'WH40K.SETTINGS.ReconcileOriginGrantsOnReady.Name',
        hint: 'WH40K.SETTINGS.ReconcileOriginGrantsOnReady.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    // Warband Subtlety pool (#64): a single world-scoped value shared by
    // every DH2 acolyte. Sheet-driven (config: false — set via the
    // Subtlety stepper, not the settings menu); its onChange re-renders
    // open sheets so the shared value stays in sync across clients.
    warbandSubtlety: numberSetting({
        key: 'warband-subtlety',
        name: 'WH40K.SETTINGS.WarbandSubtlety.Name',
        hint: 'WH40K.SETTINGS.WarbandSubtlety.Hint',
        scope: 'world',
        config: false,
        default: WARBAND_SUBTLETY_DEFAULT,
        onChange: rerenderSubtletyDependentSheets,
    }),
    // Warband Inquests (#90): world-scoped JSON list, edited through the
    // GM Inquest tracker (config: false). Shown in the same DH2 Party
    // Overview as Subtlety, so the same sheets re-render on change.
    warbandInquests: jsonSetting({
        key: 'warband-inquests',
        name: 'WH40K.SETTINGS.WarbandInquests.Name',
        hint: 'WH40K.SETTINGS.WarbandInquests.Hint',
        scope: 'world',
        config: false,
        default: '[]',
        parse: parseInquests,
        empty: [] as InquestState[],
        onChange: rerenderSubtletyDependentSheets,
    }),
    // Campaign-inception world-time stamp (#487): the game.time.worldTime
    // value treated as "Day 0" for the day-since-inception counter.
    // config: false — Day 0 is the campaign/mission inception and is not
    // re-anchorable from the widget; it is captured once at campaign start.
    worldTimeInception: numberSetting({
        key: 'world-time-inception',
        name: 'WH40K.SETTINGS.WorldTimeInception.Name',
        hint: 'WH40K.SETTINGS.WorldTimeInception.Hint',
        scope: 'world',
        config: false,
        default: WORLD_TIME_INCEPTION_DEFAULT,
    }),
    // The last forward advance of the world clock (#703): JSON, written by
    // the active GM on each advance and read by the widget's Undo button.
    worldTimeLastAdvance: jsonSetting({
        key: 'world-time-last-advance',
        name: 'WH40K.SETTINGS.WorldTimeLastAdvance.Name',
        hint: 'WH40K.SETTINGS.WorldTimeLastAdvance.Hint',
        scope: 'world',
        config: false,
        default: '',
        parse: parseLastAdvance,
        empty: null as LastAdvance | null,
    }),
    // The campaign's inception date as a canonical Imperial timestamp
    // (#487). Day 0 IS this date; the widget renders inception + elapsed
    // world time. Exposed in the settings menu because it is campaign
    // configuration a GM sets once, not a one-click control beside the
    // advance buttons.
    campaignInceptionDate: stringSetting({
        key: 'campaign-inception-date',
        name: 'WH40K.SETTINGS.CampaignInceptionDate.Name',
        hint: 'WH40K.SETTINGS.CampaignInceptionDate.Hint',
        scope: 'world',
        config: true,
        default: CAMPAIGN_INCEPTION_DATE_DEFAULT,
    }),
    // Auto-generate an actor image on compendium drop via an OpenAI-
    // compatible image endpoint (#576). Default `never` (off).
    tokenImageGenMode: choiceSetting<'token-image-gen-mode', TokenImageGenMode>({
        key: 'token-image-gen-mode',
        name: 'WH40K.SETTINGS.TokenImageGenMode.Name',
        hint: 'WH40K.SETTINGS.TokenImageGenMode.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'never',
        choices: {
            'never': 'WH40K.SETTINGS.TokenImageGenMode.Choices.Never',
            'if-no-image': 'WH40K.SETTINGS.TokenImageGenMode.Choices.IfNoImage',
            'ask': 'WH40K.SETTINGS.TokenImageGenMode.Choices.Ask',
            'always': 'WH40K.SETTINGS.TokenImageGenMode.Choices.Always',
        },
    }),
    tokenImageGenEndpoint: stringSetting({
        key: 'token-image-gen-endpoint',
        name: 'WH40K.SETTINGS.TokenImageGenEndpoint.Name',
        hint: 'WH40K.SETTINGS.TokenImageGenEndpoint.Hint',
        scope: 'world',
        config: true,
        default: '',
    }),
    tokenImageGenModel: stringSetting({
        key: 'token-image-gen-model',
        name: 'WH40K.SETTINGS.TokenImageGenModel.Name',
        hint: 'WH40K.SETTINGS.TokenImageGenModel.Hint',
        scope: 'world',
        config: true,
        default: '',
    }),
    tokenImageGenApiKey: stringSetting({
        key: 'token-image-gen-api-key',
        name: 'WH40K.SETTINGS.TokenImageGenApiKey.Name',
        hint: 'WH40K.SETTINGS.TokenImageGenApiKey.Hint',
        scope: 'world',
        config: true,
        default: '',
    }),
    tokenImageGenSize: stringSetting({
        key: 'token-image-gen-size',
        name: 'WH40K.SETTINGS.TokenImageGenSize.Name',
        hint: 'WH40K.SETTINGS.TokenImageGenSize.Hint',
        scope: 'world',
        config: true,
        default: '1024x1024',
    }),
    // Black Crusade apotheosis: the Infamy the GM sets for
    // a champion claimed at 100 Corruption to become a Daemon Prince
    // rather than a Chaos Spawn.
    apotheosisInfamyThreshold: numberSetting({
        key: 'apotheosis-infamy-threshold',
        name: 'WH40K.SETTINGS.ApotheosisInfamyThreshold.Name',
        hint: 'WH40K.SETTINGS.ApotheosisInfamyThreshold.Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: APOTHEOSIS_INFAMY_THRESHOLD_DEFAULT,
    }),
    // Attack cues (#594): the GM's switch for the whole table. Off, no
    // client plays an attack animation or sound.
    attackCues: booleanSetting({
        key: 'attack-cues',
        name: 'WH40K.SETTINGS.AttackCues.Name',
        hint: 'WH40K.SETTINGS.AttackCues.Hint',
        scope: 'world',
        config: true,
        default: true,
    }),
    attackCueAnimations: booleanSetting({
        key: 'attack-cue-animations',
        name: 'WH40K.SETTINGS.AttackCueAnimations.Name',
        hint: 'WH40K.SETTINGS.AttackCueAnimations.Hint',
        scope: 'client',
        config: true,
        default: true,
    }),
    attackCueSounds: booleanSetting({
        key: 'attack-cue-sounds',
        name: 'WH40K.SETTINGS.AttackCueSounds.Name',
        hint: 'WH40K.SETTINGS.AttackCueSounds.Hint',
        scope: 'client',
        config: true,
        default: true,
    }),
    attackCueVolume: numberSetting({
        key: 'attack-cue-volume',
        name: 'WH40K.SETTINGS.AttackCueVolume.Name',
        hint: 'WH40K.SETTINGS.AttackCueVolume.Hint',
        scope: 'client',
        config: true,
        default: ATTACK_CUE_VOLUME_DEFAULT,
        range: { min: 0, max: 1, step: 0.05 },
    }),
    // Status-effect visuals (#595): under the same GM switch as attack cues.
    statusVisuals: booleanSetting({
        key: 'status-visuals',
        name: 'WH40K.SETTINGS.StatusVisuals.Name',
        hint: 'WH40K.SETTINGS.StatusVisuals.Hint',
        scope: 'client',
        config: true,
        default: true,
    }),
    statusVisualIntensity: numberSetting({
        key: 'status-visual-intensity',
        name: 'WH40K.SETTINGS.StatusVisualIntensity.Name',
        hint: 'WH40K.SETTINGS.StatusVisualIntensity.Hint',
        scope: 'client',
        config: true,
        default: STATUS_VISUAL_INTENSITY_DEFAULT,
        range: { min: 0, max: 1, step: 0.05 },
    }),
};

type SystemSettingTypes = SettingValueTypes<typeof SETTINGS_TABLE>;

// Every system setting, typed per key from this table and the Event Tracker's
// (#712): an unregistered key no longer compiles, and `game.settings.get`
// returns the setting's own type.
declare module 'fvtt-types/configuration' {
    interface SettingConfig extends SystemSettingTypes, EventTrackerSettingTypes {}
}

const T = SETTINGS_TABLE;

// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with static SETTINGS constants and many callers
export class WH40KSettings {
    /** Every system setting, in registration order (#712). */
    static readonly TABLE = SETTINGS_TABLE;

    /** Property name → setting key, derived from the table. */
    static readonly SETTINGS = settingKeys(SETTINGS_TABLE);

    /** Default attack-cue volume (#594), 0–1. */
    static ATTACK_CUE_VOLUME_DEFAULT = ATTACK_CUE_VOLUME_DEFAULT;

    /** Default status-visual intensity scale (#595), 0–1. */
    static STATUS_VISUAL_INTENSITY_DEFAULT = STATUS_VISUAL_INTENSITY_DEFAULT;

    /** Default BC apotheosis Infamy threshold (BC rules). */
    static APOTHEOSIS_INFAMY_THRESHOLD_DEFAULT = APOTHEOSIS_INFAMY_THRESHOLD_DEFAULT;

    /** Floor/ceiling of the warband Subtlety pool (#64). RAW DH2: 0–100. */
    static WARBAND_SUBTLETY_MAX = WARBAND_SUBTLETY_MAX;
    static WARBAND_SUBTLETY_DEFAULT = WARBAND_SUBTLETY_DEFAULT;

    /** Default campaign-inception world-time stamp (#487). */
    static WORLD_TIME_INCEPTION_DEFAULT = WORLD_TIME_INCEPTION_DEFAULT;

    /** Neutral placeholder for the campaign-inception Imperial timestamp (#487). */
    static CAMPAIGN_INCEPTION_DATE_DEFAULT = CAMPAIGN_INCEPTION_DATE_DEFAULT;

    /** The settings that decide how this client plays attack cues (#594). Safe before registration (all on, default volume). */
    static getAttackCueSettings(): { worldEnabled: boolean; animationsEnabled: boolean; soundsEnabled: boolean; volume: number } {
        return {
            worldEnabled: readSetting(T.attackCues),
            animationsEnabled: readSetting(T.attackCueAnimations),
            soundsEnabled: readSetting(T.attackCueSounds),
            volume: readSetting(T.attackCueVolume),
        };
    }

    /**
     * The settings that decide how this client shows status-effect visuals (#595): the
     * same GM switch, sounds and volume as attack cues, plus this user's own status
     * toggle and intensity scale. Safe before registration (all on, full intensity).
     */
    static getStatusVisualSettings(): { worldEnabled: boolean; enabled: boolean; intensity: number; soundsEnabled: boolean; volume: number } {
        const cues = WH40KSettings.getAttackCueSettings();
        return {
            worldEnabled: cues.worldEnabled,
            enabled: readSetting(T.statusVisuals),
            intensity: readSetting(T.statusVisualIntensity),
            soundsEnabled: cues.soundsEnabled,
            volume: cues.volume,
        };
    }

    /**
     * Read the campaign-inception Imperial date (#487), falling back to the
     * default when the setting is unregistered or holds a malformed stamp — a bad
     * value must not take the world-time widget down.
     */
    static getCampaignInceptionDate(): ImperialDate {
        return parseImperialDate(readSetting(T.campaignInceptionDate)) ?? (parseImperialDate(CAMPAIGN_INCEPTION_DATE_DEFAULT) as ImperialDate);
    }

    /**
     * Read the durable campaign-inception world-time stamp (#487) — the
     * `game.time.worldTime` value treated as "Day 0" for the day-since-inception
     * counter. World-scoped so it survives reload and is shared by every client.
     * Falls back to {@link WORLD_TIME_INCEPTION_DEFAULT} (0) before the setting is
     * registered or when the stored value is not a finite number, so the widget
     * can read it during early boot without throwing.
     */
    static getWorldTimeInception(): number {
        return Math.trunc(readSetting(T.worldTimeInception));
    }

    /**
     * Anchor "Day 0" to a world-time stamp (#487), truncated to a whole second.
     * World-scoped, so the change propagates to every connected client (the
     * world-time widget refreshes on the `updateSetting` hook). GM-only in
     * practice — a world setting write is rejected for non-GM users by Foundry.
     */
    static async setWorldTimeInception(stamp: number): Promise<void> {
        await writeSetting(T.worldTimeInception, Number.isFinite(stamp) ? Math.trunc(stamp) : WORLD_TIME_INCEPTION_DEFAULT);
    }

    /**
     * Read the single warband-wide Subtlety value (#64) — a world-scoped pool
     * shared by every DH2 acolyte. Clamped to 0..max. Safe to call before the
     * setting is registered (returns the default), so DataModel prep can read it
     * during early boot without throwing.
     */
    static getWarbandSubtlety(): number {
        return Math.max(0, Math.min(WARBAND_SUBTLETY_MAX, Math.trunc(readSetting(T.warbandSubtlety))));
    }

    /**
     * Write the warband Subtlety value (#64), clamped to 0..max. World-scoped, so
     * the change propagates to every connected client; the setting's `onChange`
     * re-renders open sheets (see {@link rerenderSubtletyDependentSheets}).
     */
    static async setWarbandSubtlety(value: number): Promise<void> {
        await writeSetting(T.warbandSubtlety, Math.max(0, Math.min(WARBAND_SUBTLETY_MAX, Math.trunc(value))));
    }

    /**
     * Re-render every rendered actor sheet that surfaces the warband Subtlety
     * pool (#64), so a change made on one acolyte's sheet is reflected on all
     * open sheets. Fired from the setting's `onChange`, which runs on every
     * connected client when the world value changes. Filters to actors that
     * carry the (DH2-only) `subtlety` field so it is a no-op elsewhere.
     */
    static rerenderSubtletyDependentSheets(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: game may be undefined before 'setup'; actors/sheets are loosely typed at the Foundry boundary
        const actors = (globalThis as { game?: { actors?: { contents?: unknown[] } } }).game?.actors?.contents;
        if (!Array.isArray(actors)) return;
        for (const actor of actors) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: narrow the Foundry actor surface we touch (system.subtlety + sheet.render)
            const a = actor as { system?: { subtlety?: unknown }; sheet?: { rendered?: boolean; render?: (force?: boolean) => unknown } };
            if (a.system?.subtlety === undefined) continue;
            if (a.sheet?.rendered === true) void a.sheet.render?.();
        }
    }

    /** The world's migration version (`wh40k-rpg-migrations.ts`). */
    static getWorldVersion(): number {
        return readSetting(T.worldVersion);
    }

    /** Record the world's migration version. */
    static async setWorldVersion(version: number): Promise<void> {
        await writeSetting(T.worldVersion, version);
    }

    /** When true (default), Active Effects are processed during combat turns. Read at turn change. */
    static isActiveEffectsDuringCombatEnabled(): boolean {
        return readSetting(T.processActiveEffectsDuringCombat);
    }

    /** Client preference: attack rolls skip the full roll dialog. Off by default. */
    static isSimpleAttackRolls(): boolean {
        return readSetting(T.simpleAttackRolls);
    }

    /** Client preference: psychic power rolls skip the full roll dialog. Off by default. */
    static isSimplePsychicRolls(): boolean {
        return readSetting(T.simplePsychicRolls);
    }

    /** When true (default), Psychic Phenomena are rolled automatically when a power triggers them. */
    static isAutoPsychicPhenomenaEnabled(): boolean {
        return readSetting(T.autoPsychicPhenomena);
    }

    /** When true (default), the world re-syncs compendium-backed actors on `ready`. */
    static isResyncOnReadyEnabled(): boolean {
        return readSetting(T.resyncOnReady);
    }

    /** When true, a dead NPC becomes a loot pile. Off by default. */
    static isDeathLootPilesEnabled(): boolean {
        return readSetting(T.deathLootPiles);
    }

    /** When true (default), origin-path grants are reconciled on `ready`. */
    static isOriginGrantReconcileEnabled(): boolean {
        return readSetting(T.reconcileOriginGrantsOnReady);
    }

    /** The saved combat presets (#712). A copy: callers may change it before writing it back. */
    static getCombatPresets(): CombatPreset[] {
        return [...readSetting(T.combatPresets)];
    }

    /** Store the combat presets. */
    static async setCombatPresets(presets: CombatPreset[]): Promise<void> {
        await writeSetting(T.combatPresets, presets);
    }

    /** When true, a successful weapon/psychic attack rolls its damage automatically
     *  and posts the damage card, rather than waiting for the chat "Roll Damage"
     *  button. Defaults to true. Safe to call before the setting is registered
     *  (returns true). */
    static isAutoRollDamageEnabled(): boolean {
        return readSetting(T.autoRollDamage);
    }

    /** When true, a damage roll resolved on a GM client against a selected target
     *  automatically applies the reduced damage (armour by hit location + Toughness
     *  Bonus) to the target — rolling critical damage and applying its status on
     *  overflow — instead of waiting for the chat "Assign Damage" button. Opt-in;
     *  defaults to false. Safe before registration (returns false). */
    static isAutoApplyDamageEnabled(): boolean {
        return readSetting(T.autoApplyDamage);
    }

    /** When true, weapon attacks may only be initiated during an active combat
     *  encounter the attacker is part of (#251). Defaults to true; GMs can
     *  disable it for out-of-combat / narrative attacks. Safe before
     *  registration (returns true). */
    static isCombatRequiredToAttack(): boolean {
        return readSetting(T.requireCombatToAttack);
    }

    /**
     * Movement-automation level (#235): `full` enforces character movement speeds
     * during combat, `display` shows the ruler only, `none` is off. Defaults to
     * `full`. Safe before registration (returns `full`).
     */
    static getMovementAutomation(): 'full' | 'display' | 'none' {
        return readSetting(T.movementAutomation);
    }

    /** Homebrew: allow more than one Fate Point spend on the same roll. RAW permits only one. */
    static isMultipleFateBurnAllowed(): boolean {
        return readSetting(T.multipleFateBurnPerRoll);
    }

    /** Integer offset added to the characteristic base (25) during character generation. Defaults to 0. */
    static getCharacteristicOffset(): number {
        return Math.trunc(readSetting(T.characteristicOffset));
    }

    /** Effective base characteristic value used by character generation: 25 + offset. */
    static getCharacteristicBase(): number {
        // RAW characteristic base for the FFG d100 family (2d10+25 → base 25). The
        // offset setting tunes it per world; experienced starts add +5 on top (#223).
        return 25 + WH40KSettings.getCharacteristicOffset();
    }

    /**
     * Size of the point pool a player spends in point-buy character generation.
     * Content-agnostic primitive (a budget integer, not a per-characteristic
     * mechanic table) — the spend cost is a flat 1 point per +1, so no content
     * lookup is involved. Defaults to 60 (DH2e). Clamped to a non-negative integer.
     */
    static getCharacteristicPointBuyPool(): number {
        return Math.max(0, Math.trunc(readSetting(T.pointBuyPool)));
    }

    /**
     * The GM-set Infamy a Black Crusade champion needs for apotheosis (BC
     * rules). Non-negative integer; a non-numeric stored value, or a call before
     * registration, falls back to {@link APOTHEOSIS_INFAMY_THRESHOLD_DEFAULT}.
     */
    static getApotheosisInfamyThreshold(): number {
        return Math.max(0, Math.trunc(readSetting(T.apotheosisInfamyThreshold)));
    }

    /** The configured degrees-of-success mode (defaults to `raw`, which
     *  resolves per game system at the call site). Safe before registration. */
    static getDegreesMode(): DegreesMode {
        return readSetting(T.degreesMode);
    }

    /** Active fatigue-model override (#114). `auto` = each game line's RAW default
     *  (halving for DH1/DH2, flat for RT/DW/OW/BC, condition for IM); otherwise the
     *  chosen model is forced for every actor. Safe before registration (returns
     *  `auto`). */
    static getFatigueMode(): FatigueMode {
        return readSetting(T.fatigueMode);
    }

    /** When true (default), opening an unbuilt character/NPC sheet prompts to
     *  run the origin-path builder. Safe before registration (returns true). */
    static isOriginPathPromptEnabled(): boolean {
        return readSetting(T.promptIncompleteOriginPath);
    }

    /** When true, building a character by dragging items (e.g. an origin path)
     *  directly onto an actor is permitted; otherwise the supported path is the
     *  Origin Path Builder. Defaults to false. Safe before registration. See
     *  issue #219. */
    static isFreeformCharactersEnabled(): boolean {
        return readSetting(T.freeformCharacters);
    }

    /** When true, the "Drop to Add" dropzone on the Talents and Traits panels is
     *  shown, permitting talents/traits to be added by drag-and-drop outside the
     *  advancement/XP flow (#396). Defaults to false so the dropzone is hidden
     *  by default and talents/traits go through the structured advancement path.
     *  Safe to call before the setting is registered (returns false). */
    static isFreeformCreation(): boolean {
        return readSetting(T.freeformCreation);
    }

    /**
     * Freeform-bypass gate for an item that is **owned by an actor** (#571).
     * Editing a character's own copy of content (a weapon, an origin-path step)
     * is a direct-edit bypass of the sanctioned path (compendium import /
     * origin-path creator), so it is only permitted when {@link
     * isFreeformCharactersEnabled} is on. A world / compendium copy (authoring,
     * `isOwnedByActor === false`) is always allowed. Combine with a sheet's base
     * `canEdit` / `inEditMode` via `&&`.
     */
    static freeformOwnedGate(isOwnedByActor: boolean): boolean {
        return !isOwnedByActor || WH40KSettings.isFreeformCharactersEnabled();
    }

    /** When true, the Build Clip action lets players compose an ordered mixed
     *  magazine (#ammo-system). Off by default — RAW loads one ammo type per clip;
     *  enabling this exposes the mixed-loadout builder. Safe to call before the
     *  setting is registered (returns false). */
    static isMagazineBuildingEnabled(): boolean {
        return readSetting(T.magazineBuilding);
    }

    /** Homebrew: track standard ammunition as inventory items. On, a starting
     *  ranged weapon comes with two clips of the line's standard ammunition and
     *  Reload uses them up; off, Reload tops a weapon up without an ammunition
     *  item (standard ammo goes uncounted). Off by default; safe before registration. */
    static isStandardAmmoTrackingEnabled(): boolean {
        return readSetting(T.standardAmmoTracking);
    }

    /** When true, NPCs are treated as buildable characters (#503): their stat block is
     *  split into purchasable advances, aptitudes are derived from it, and XP at spawn
     *  equals the exact cost of those advances — so a GM can keep advancing them through
     *  the Advancement Dialog. Off by default: NPCs stay flat stat blocks, and none of the
     *  derivation runs. Safe to call before the setting is registered (returns false). */
    static isNpcAdvancementEnabled(): boolean {
        return readSetting(T.npcAdvancement);
    }

    /** When true, dropping a compendium actor onto a scene imports a world Actor
     *  first (Foundry's default). Off by default: non-character actors are placed as
     *  token-only, compendium-backed unlinked tokens (#586). Safe to call before the
     *  setting is registered (returns false). */
    static isCompendiumDropImportEnabled(): boolean {
        return readSetting(T.compendiumDropImportsActor);
    }

    /** The campaign's celestial bodies (#588) — name, rotation, orbit, tilt and
     *  current weather per body — as the GM configured them. World data, stored as
     *  JSON and validated on read; anything unparseable reads as no bodies, so
     *  scene lighting simply stays manual. Safe before registration (returns {}). */
    static getCelestialBodies(): CelestialBodies {
        return readJsonSetting(T.celestialBodies);
    }

    /** Persist the celestial bodies (#588); world-scoped, so every client sees it. */
    static async setCelestialBodies(bodies: CelestialBodies): Promise<void> {
        await writeSetting(T.celestialBodies, JSON.stringify(bodies));
    }

    /** The last forward advance of the world clock (#703), for the widget's undo; null when there is none to undo. Safe before registration. */
    static getLastWorldTimeAdvance(): LastAdvance | null {
        return readJsonSetting(T.worldTimeLastAdvance);
    }

    /** Store (or, with null, drop) the last world-time advance (#703). World-scoped, so every GM's widget offers the same undo. */
    static async setLastWorldTimeAdvance(record: LastAdvance | null): Promise<void> {
        await writeSetting(T.worldTimeLastAdvance, record === null ? '' : JSON.stringify(record));
    }

    /** The warband's Inquests (#90): a world-scoped list stored as JSON and
     *  validated on read. Anything unparseable reads as no Inquests. Safe
     *  before registration (returns []). */
    static getWarbandInquests(): InquestState[] {
        return readJsonSetting(T.warbandInquests);
    }

    /** Persist the warband's Inquests (#90). World-scoped, so only a GM can write it. */
    static async setWarbandInquests(inquests: readonly InquestState[]): Promise<void> {
        await writeSetting(T.warbandInquests, JSON.stringify(inquests));
    }

    /** When true, the manual roll input (physical dice entry) is shown in the
     *  roll dialog. Off by default — most tables use digital dice exclusively.
     *  Safe to call before the setting is registered (returns false). */
    static isManualRollEnabled(): boolean {
        return readSetting(T.allowManualRoll);
    }

    /** When/whether to auto-generate an actor image on compendium drop (#576).
     *  Defaults to `never`. Safe to call before the setting is registered. */
    static getTokenImageGenMode(): TokenImageGenMode {
        return readSetting(T.tokenImageGenMode);
    }

    /** The resolved token-image-generation config (#576) — mode + endpoint + model +
     *  API key + size, each with a safe fallback. */
    static getTokenImageGenConfig(): TokenImageGenConfig {
        return {
            mode: WH40KSettings.getTokenImageGenMode(),
            endpoint: readSetting(T.tokenImageGenEndpoint),
            model: readSetting(T.tokenImageGenModel),
            apiKey: readSetting(T.tokenImageGenApiKey),
            size: readSetting(T.tokenImageGenSize),
        };
    }

    /** Current DH2e ruleset (raw vs homebrew). Safe to call before setting is registered (returns homebrew). */
    static getRuleset(): DH2Ruleset {
        return readSetting(T.dh2Ruleset);
    }

    static isHomebrew(): boolean {
        return WH40KSettings.getRuleset() === 'homebrew';
    }

    /** When true, targeting yourself in the attack/roll dialog uses the homebrew
     *  self-target treatment: point-blank range, and the enemy-defence situational
     *  modifiers (target size, cover, target-state) are skipped since they don't
     *  apply to oneself (#393). When false, self-targeting is left to RAW. Defaults
     *  to false. Safe to call before the setting is registered (returns false). */
    static isHomebrewSelfTargeting(): boolean {
        return readSetting(T.homebrewSelfTargeting);
    }

    /** Homebrew: when true, the roll dialog offers Advantage / Disadvantage /
     *  Emphasis — the d100 test is rolled twice and one result kept (see
     *  `rolls/roll-keep.ts`). Off by default (RAW: one d100). Safe to call before
     *  the setting is registered (returns false). */
    static isRollKeepModes(): boolean {
        return readSetting(T.rollKeepModes);
    }

    /** Homebrew (#440): when true, Awareness resolves per sense channel (Visual /
     *  Auditory / Olfactory), surfacing the #246 variant selector for skills that
     *  declare variants even when the ruleset is otherwise RAW — so sense-scoped
     *  modifiers (an auspex tagged Visual) and condition channel-gates (blinded
     *  auto-fails Visual) apply. Off by default; when off, Awareness rolls exactly
     *  as RAW. Safe to call before the setting is registered (returns false). */
    static isAwarenessSenseSplit(): boolean {
        return readSetting(T.awarenessSenseSplit);
    }

    /**
     * How far above the target the attacker must be before RAW Higher Ground
     * applies (#407), in scene distance units. 0 (the default) is RAW — strictly
     * above counts. Raising it stops a crate or half a step of rubble granting
     * the +10; on a Levels map any band below the floor height still lets a
     * genuine storey qualify, since a token's elevation there is its floor's
     * base height. Safe to call before the setting is registered (returns 0),
     * and a negative / non-finite stored value falls back to RAW rather than
     * widening the rule.
     * @returns {number}  The configured band, or 0.
     */
    static getHighGroundBand(): number {
        const band = readSetting(T.highGroundBand);
        return band > 0 ? band : 0;
    }

    /** When true, the attack dialog auto-detects line of sight + full/half cover
     *  by ray-casting the attacker→target geometry against the scene's walls, and
     *  auto-selects the cover situational (#406). Off by default: the canvas
     *  geometry needs verification on real scenes before it should drive rolls.
     *  Safe to call before the setting is registered (returns false). */
    static isAutoCoverLos(): boolean {
        return readSetting(T.autoCoverLos);
    }

    /** The world's primary 40K RPG line; default dh2. Safe to call before settings init. */
    static getPrimaryGameSystem(): GameSystemId {
        const id = readSetting(T.primaryGameSystem);
        return ALL_SYSTEM_IDS.find((known) => known === id) ?? 'dh2';
    }

    /** Register every system setting, in table order (#299, #712). */
    static registerSettings(): void {
        registerSettingTable(SETTINGS_TABLE);
    }
}
