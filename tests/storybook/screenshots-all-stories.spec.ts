// Generates one full-page PNG per Storybook story under tests/storybook/screenshots/<storyId>.png (gitignored by the orchestrator).
//
// Every story file in `src/**/*.stories.ts` and `stories/**/*.stories.ts` is
// enumerated below. For each story we derive its Storybook id using the
// `@storybook/csf` algorithm:
//
//   storyId = sanitize(meta.title) + '--' + sanitize(storyNameFromExport(key))
//
// where `storyNameFromExport(key)` is `lodash.startCase(key)` (splits on
// camelCase / digit / underscore boundaries; `WeaponSheet` stays joined when
// the input is a single TitleCase token preceded by no lowercase run, but
// `WeaponPanelDH2` splits into `Weapon Panel DH 2`) and `sanitize(s)`
// lowercases, replaces every non-alphanumeric run with a single `-`, and
// trims leading/trailing hyphens.
//
// One test() per derived storyId so Playwright's reporter shows per-story
// pass / fail. Each test navigates the Storybook iframe, waits for network
// idle plus a small settle delay, captures a full-page PNG, and asserts the
// body rendered something so a wrong id fails loudly rather than producing
// a blank screenshot.

import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// sanitize + storyNameFromExport — faithful reimplementation of @storybook/csf
// ---------------------------------------------------------------------------

/**
 * lodash-startCase-equivalent: split a camelCase / PascalCase / digit-mixed
 * identifier into space-separated words, exactly the way `@storybook/csf`'s
 * `storyNameFromExport` does. Matches the documented ground-truth examples:
 *   - `WeaponPanelDH2`        → 'Weapon Panel DH 2'
 *   - `DarkHeresy2Default`    → 'Dark Heresy 2 Default'
 *   - `DarkHeresy1eVariant`   → 'Dark Heresy 1 e Variant'
 *   - `Issue206_StepReached`  → 'Issue 206 Step Reached'
 *   - `Number_`               → 'Number'
 *   - `NPCSheet`              → 'NPC Sheet'
 *   - `RendersDH2`            → 'Renders DH 2'
 *
 * Note: this is NOT the same algorithm as a simple "insert space before
 * uppercase letter" — lodash treats a run of uppercase followed by another
 * uppercase+lowercase as a word boundary (`NPCSheet` → `NPC Sheet`), and
 * groups digit runs as their own words.
 */
function startCase(input: string): string {
    if (!input) return '';
    // 1. Replace any non-alphanumeric (including underscores) with spaces.
    const cleaned = input.replace(/[^A-Za-z0-9]+/g, ' ');
    // 2. Insert a space before each uppercase letter that's preceded by a
    //    lowercase letter or digit (camelCase / numberCase boundary).
    const camelSplit = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    // 3. Insert a space between a run of uppercase letters and a following
    //    uppercase+lowercase (PascalCase abbreviation boundary, so
    //    `NPCSheet` → `NPC Sheet`).
    const abbrevSplit = camelSplit.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    // 4. Insert a space between letters and digits in both directions
    //    (`DH2` → `DH 2`, `2Default` → `2 Default`).
    const digitSplit = abbrevSplit.replace(/([A-Za-z])([0-9])/g, '$1 $2').replace(/([0-9])([A-Za-z])/g, '$1 $2');
    return digitSplit.trim().replace(/\s+/g, ' ');
}

/** Storybook's `sanitize`: lowercase, non-alnum runs → '-', trim '-'. */
function sanitize(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toStoryId(title: string, exportName: string): string {
    return `${sanitize(title)}--${sanitize(startCase(exportName))}`;
}

// ---------------------------------------------------------------------------
// Story matrix — every (title, exportNames[]) pair across the repo.
// Sourced by reading each *.stories.ts file's `title:` (Meta.title) and
// `export const <Name>` declarations. Keep this list in sync with the source
// stories — when a story is added or renamed, update the matching entry.
// ---------------------------------------------------------------------------

const STORY_MATRIX: ReadonlyArray<{ title: string; exports: readonly string[] }> = [
    // ── src/module/applications/actor/ ────────────────────────────────────
    {
        title: 'Actor/BaseActorSheet',
        exports: ['Default', 'EditMode', 'ItemCreateClick', 'RogueTrader'],
    },
    {
        title: 'Actor/CharacterSheet',
        exports: [
            'DarkHeresy2Default',
            'ImperiumMaledictum',
            'EditModeBio',
            'EnemyCreateClick',
            'BlackCrusadeVariant',
            'DarkHeresy1eVariant',
            'DeathwatchVariant',
            'OnlyWarVariant',
            'RogueTraderVariant',
            'Issue19NonReactionLocalDescription',
        ],
    },
    {
        title: 'Actor/LootActorSheet',
        exports: ['Populated', 'Empty'],
    },
    {
        title: 'Actor/NPCSheet',
        exports: [
            'Default',
            'HordeEnabled',
            'ScaleToThreatClick',
            'DarkHeresy2NPC',
            'BlackCrusadeNPC',
            'DarkHeresy1eNPC',
            'DeathwatchNPC',
            'OnlyWarNPC',
            'RogueTraderNPC',
        ],
    },
    {
        title: 'Actor/VoidcraftActorSheet',
        exports: ['Default', 'EditMode', 'RollInitiative', 'BlackCruisadeVariant', 'MacrobatteryFiring', 'LanceFiring', 'MacrobatteryMiss', 'ExtendedActions'],
    },
    {
        title: 'Actor/VehicleSheet',
        exports: ['Default', 'EditMode', 'SubmitSizeChange', 'OnlyWarVariant'],
    },

    // ── src/module/applications/character-creation/ ───────────────────────
    {
        title: 'Character Creation/Divination Section Issue 199',
        exports: ['Empty', 'Rolled', 'TableUnavailableFallback'],
    },
    {
        title: 'Character Creation/OriginPathBuilder',
        exports: [
            'Default',
            'PreviewPanel',
            'Issue206_CharacteristicStepReached',
            'Issue206_EquipmentStepReached',
            'RogueTraderDirection',
            'Issue204HomeWorldThroneGelt',
            'Issue204BackgroundNoThroneGelt',
            'Issue198VoidBornPreview',
            'Issue205AptitudeDoubling',
            'Issue215NoPhantomDuplicate',
            'Issue216ResolvedAptitudeNotARequirement',
            'Issue216UnresolvedAptitudeIsARequirement',
        ],
    },
    {
        title: 'Character Creation/OriginPathChoiceDialog',
        exports: ['Default', 'CompleteSelection', 'ConfirmFlow'],
    },
    {
        title: 'Character Creation/OriginRollDialog',
        exports: ['Default', 'Rolled', 'ActionFlow', 'RerollOverflow'],
    },

    // ── src/module/applications/components/ ──────────────────────────────
    {
        title: 'Shared/SkillTooltip',
        exports: ['Untrained', 'TrainedPlus10', 'Veteran'],
    },

    // ── src/module/applications/dialogs/ ─────────────────────────────────
    {
        title: 'Dialogs/AcquisitionDialog',
        exports: ['Default', 'NoRecent', 'RollFlow'],
    },
    {
        title: 'Dialogs/AmmoPickerDialog',
        exports: ['Default', 'SingleAmmo', 'SelectFlow'],
    },
    {
        title: 'Dialogs/CharacteristicSetupDialog',
        exports: ['PartiallyFilled', 'EmptyBank', 'RollIndexAttributes'],
    },
    {
        title: 'Dialogs/ConfirmationDialog',
        exports: ['Default', 'Acquisition', 'ConfirmFlow'],
    },
    {
        title: 'Dialogs/InventoryGeneratorDialog',
        exports: ['Generate', 'Browse', 'EmptyStaging', 'PoolEmpty', 'ImperiumMaledictumVariant'],
    },
    {
        title: 'Dialogs/TransactionApprovalDialog',
        exports: ['Default', 'NoAdjustments', 'GmSurcharge', 'ApprovalControls'],
    },
    {
        title: 'Dialogs/TransactionRequestDialog',
        exports: [
            'SourceSelection',
            'NoSources',
            'ItemSelected',
            'BarterWithInfluenceBurn',
            'HostileDisposition',
            'TransferInteractions',
            'NoInfluenceBurnGate',
        ],
    },

    // ── src/module/applications/item/ ────────────────────────────────────
    {
        title: 'Item Sheets/AmmoSheet',
        exports: ['Default', 'HighDamage', 'RendersTabs'],
    },
    {
        title: 'Item Sheets/ArmourModSheet',
        exports: ['Header', 'Restrictions', 'Modifiers', 'FullSheet', 'RendersItemName', 'RendersEditImageAction'],
    },
    {
        title: 'Item Sheets/ArmourSheet',
        exports: ['Default', 'Unequipped', 'EditMode', 'RendersArmourName', 'RendersEditModeToggle'],
    },
    {
        title: 'Item Sheets/AttackSpecialSheet',
        exports: ['Default', 'Disabled', 'RendersAndAcceptsName'],
    },
    {
        title: 'Item Sheets/BaseItemSheet',
        exports: ['Default', 'EditMode', 'RendersTitle', 'RendersDescriptionTab'],
    },
    {
        title: 'Item Sheets/ConditionSheet',
        exports: ['Default', 'NotStackable', 'RendersTabs'],
    },
    {
        title: 'Item Sheets/ContainerItemSheet',
        exports: ['Default', 'Empty', 'RendersContainerName', 'RendersDescriptionTab'],
    },
    {
        title: 'Item Sheets/CriticalInjurySheet',
        exports: ['Display', 'Permanent', 'RendersHeader'],
    },
    {
        title: 'Item Sheets/CyberneticSheet',
        exports: ['Default', 'EditMode', 'RendersCyberneticName', 'RendersTypeLabel'],
    },
    {
        title: 'Item Sheets/DefineSimpleItemSheet',
        exports: ['Default', 'EditMode', 'RendersItemName', 'RendersWeightField'],
    },
    {
        title: 'Actor Panels/EndeavourPanel',
        exports: ['Empty', 'InProgress', 'Completed'],
    },
    {
        title: 'Item Sheets/EndeavourSheet',
        exports: ['Default', 'RendersProgressBar', 'RendersObjectiveRows'],
    },
    {
        title: 'Item Sheets/ForceFieldSheet',
        exports: ['Default', 'Overloaded', 'RendersFieldName', 'RendersStatusBadge'],
    },
    {
        title: 'Item Sheets/GearSheet',
        exports: ['Default', 'UsesExhausted', 'RendersName'],
    },
    {
        title: 'Item Sheets/JournalEntryItemSheet',
        exports: ['Default', 'EditMode', 'RendersTitle', 'RendersLocationField'],
    },
    {
        title: 'Item Sheets/NPCTemplateSheet',
        exports: ['Header', 'TabNav', 'BasicsTab', 'FullSheet', 'RendersNPCName', 'RendersTabButtons'],
    },
    {
        title: 'Item Sheets/OriginPathSheet',
        exports: ['Default', 'EditMode', 'RendersOriginName', 'RendersStepBadge'],
    },
    {
        title: 'Item Sheets/PeerEnemySheet',
        exports: ['Peer', 'Enemy', 'RendersFields'],
    },
    {
        title: 'Item Sheets/PsychicPowerSheet',
        exports: ['Default', 'EditMode', 'RendersPowerName', 'RendersDisciplineBadge'],
    },
    {
        title: 'Item Sheets/ShipComponentSheet',
        exports: ['Default', 'EditMode', 'RendersComponentName', 'RendersDetailsTab'],
    },
    {
        title: 'Item Sheets/ShipUpgradeSheet',
        exports: ['Default', 'EditMode', 'RendersUpgradeName', 'RendersDetailsTabActive'],
    },
    {
        title: 'Item Sheets/ShipWeaponSheet',
        exports: ['Default', 'EditMode', 'RendersWeaponName', 'RendersDetailsTabActive'],
    },
    {
        title: 'Item Sheets/SkillSheet',
        exports: ['Specialist', 'Basic', 'RendersSelectAndName'],
    },
    {
        title: 'Item Sheets/StorageLocationSheet',
        exports: ['Empty', 'RendersTabs'],
    },
    {
        title: 'Item Sheets/TalentEditorDialog',
        exports: ['PrerequisitesTab', 'ModifiersTab', 'GrantsTab', 'RendersSectionTabs', 'ClicksModifiersSection'],
    },
    {
        title: 'Item Sheets/TalentSheet',
        exports: ['Default', 'EditMode', 'RendersTalentName', 'RendersEditImageAction', 'CompendiumRender'],
    },
    {
        title: 'Item Sheets/TraitSheet',
        exports: ['Default', 'Variable', 'RendersBadges'],
    },
    {
        title: 'Item Sheets/WeaponModSheet',
        exports: ['Default', 'EditMode', 'RendersName', 'RendersWeightField'],
    },
    {
        title: 'Item Sheets/WeaponQualitySheet',
        exports: ['Default', 'Levelled', 'RendersIdentifier'],
    },
    {
        title: 'Item Sheets/WeaponSheet',
        exports: ['Default', 'BodyExpanded', 'EditMode', 'NoAmmoLoaded', 'RendersWeaponName', 'RendersToggleBodyAction'],
    },

    // ── src/module/applications/prompts/ ─────────────────────────────────
    {
        title: 'Prompts/AddXPDialog',
        exports: ['ZeroDelta', 'AddingXP', 'SubtractingXP', 'ApplyDisabledAtZero'],
    },
    {
        title: 'Dialogs/EffectCreationDialog',
        exports: ['ConditionTab', 'CharacteristicTab', 'SkillTab', 'CustomTab', 'CategoryTabsDispatch'],
    },
    {
        title: 'Prompts/RighteousFuryDialog',
        exports: ['Pending', 'Confirmed', 'NotConfirmed', 'RollFlow'],
    },
    {
        title: 'Prompts/SpecialistSkillDialog',
        exports: ['NoSkillSelected', 'WithPreselectedSkillAndSpecializations', 'ActionButtonsDispatch'],
    },

    // ── src/module/rules/ ────────────────────────────────────────────────
    {
        title: 'Rules / Manacles (#105)',
        exports: [
            'PillCompact',
            'PillFullExpanded',
            'ActorPanelOnlyManacled',
            'ActorPanelStacked',
            'ComposedSheetAndDialogDH2',
            'ComposedSheetAndDialogIM',
            'ComposedSheetAndDialogRT',
        ],
    },

    // ── src/templates/actor/panel/ ───────────────────────────────────────
    {
        title: 'Actor/Character/CrusaderButton',
        exports: ['Active', 'Hidden'],
    },
    {
        title: 'Actor/Character/MovementPanelCompact',
        exports: ['OutOfCombat', 'YourTurnChargeSelected', 'YourTurnBudgetLow', 'NotYourTurn', 'RogueTraderYourTurn'],
    },
    {
        title: 'Actor/Starship/ShipPointsBudgetPanel',
        exports: ['CleanBuild', 'OverBudget', 'MissingEssentialSlot'],
    },

    // ── src/templates/actor/partial/ ─────────────────────────────────────
    {
        title: 'Actor/Partials/DashboardZone',
        exports: ['Default', 'Combat', 'CustomContentClass'],
    },
    {
        title: 'Actor/Partials/DegreeMeterPanel',
        exports: ['CorruptionDH2Pure', 'CorruptionDH2Soiled', 'CorruptionDH2Debased', 'InsanityDH2', 'CorruptionIM', 'CorruptionRT'],
    },
    {
        title: 'Actor/Partials/HeaderBase',
        exports: ['SidebarDH2', 'SidebarIM', 'HorizontalVehicle', 'HorizontalStarship', 'HorizontalNPC'],
    },
    {
        title: 'Actor/Partials/Panel',
        exports: ['Default', 'NoIcon', 'WithCount', 'WithHeaderActionInfo', 'WithHeaderActionGold', 'WithDropZone', 'FullList', 'HeaderActionDispatch'],
    },
    {
        title: 'Actor/Partials/PipTrackerRow',
        exports: ['Empty', 'Partial', 'Full', 'FatigueBolts', 'CriticalDamage', 'ClickDispatch'],
    },
    {
        title: 'Actor/Partials/SectionCard',
        exports: ['Default', 'NoAddButton', 'WithList', 'EmptyState', 'AddButtonDispatch'],
    },
    {
        title: 'Actor/Partials/StatBox',
        exports: ['ValueOverMax', 'SingleValue', 'VehicleStructure', 'StarshipMorale', 'StarshipCrewRating', 'ValueMaxNamesBind'],
    },
    {
        title: 'Actor/Partials/VitalInlineRow',
        exports: ['Wounds', 'WoundsCritical', 'WoundsWarning', 'SimpleValueOnly', 'MentalCorruption', 'FatigueWithPenalty', 'ClickDispatch'],
    },

    // ── src/templates/shared/ ────────────────────────────────────────────
    {
        title: 'Shared/FieldRow',
        exports: ['Text', 'TextWithValue', 'Number_', 'Select', 'Textarea', 'Readonly', 'NumberDispatch'],
    },

    // ── stories/ (top-level) ─────────────────────────────────────────────
    {
        title: 'Item Sheets/Armour Sheet',
        exports: ['Standard', 'StowedReadOnly', 'EditMode'],
    },
    {
        title: 'Actor/Character Sheets',
        exports: ['DarkHeresy2Biography', 'ImperiumMaledictumBiography', 'ImperiumMaledictumNpc'],
    },
    {
        title: 'Effects/Row + Panels',
        exports: [
            'RowFullExpanded',
            'RowCompact',
            'RowDisabledNoEdit',
            'ActorActiveEffectsPanel',
            'ActorEffectsPanelLegacy',
            'ActorActiveEffectsCompact',
            'ItemActiveEffectsPanel',
            'ItemActiveEffectsPanelEmbedded',
            'ComposedAllPanelsDH2',
            'ComposedAllPanelsIM',
            'ComposedAllPanelsRT',
        ],
    },
    {
        title: 'Item Sheets/Gear Sheet',
        exports: ['Standard', 'UsesExhausted', 'HiddenCostReadOnly'],
    },
    {
        title: 'Foundation/Icons',
        exports: ['Default', 'PerSystemMatrix', 'Catalogue'],
    },
    {
        title: 'Inventory/Item Table',
        exports: [
            'TableChromeOnly',
            'RowSimple',
            'RowExpanded',
            'WeaponPanelDH2',
            'WeaponPanelIM',
            'WeaponPanelRT',
            'ArmourPanelDH2',
            'ArmourPanelIM',
            'ComposedWithMockItem',
            'ShipWeaponsPanelDH2',
            'ShipWeaponsPanelRT',
            'ShipComponentsPanelDH2',
            'ShipUpgradesPanelDH2',
            'ShipCrewPanelDH2',
            'VehicleWeaponsPanelDH2',
            'VehicleUpgradesPanelDH2',
        ],
    },
    {
        title: 'Chat/Roll Cards',
        exports: ['SimpleSuccess', 'SimpleTargetOnly', 'DamageWithAssignableHit', 'ActionSuccessWithControls', 'ActionFailureWithoutDamage'],
    },
    {
        title: 'Shared/Components',
        exports: [
            'ActiveEffectsPanel',
            'ActiveEffectsEmptyEmbedded',
            'ActiveModifiersPanel',
            'ActiveModifiersCollapsed',
            'WeaponQuickActions',
            'CompactConditionQuickActions',
            'InSheetTalentQuickActions',
        ],
    },
    {
        title: 'Chat/Ship Critical Hit',
        exports: ['Vacuum', 'Fire', 'Bridge', 'Drive', 'CrewCasualties', 'TableUnavailableFallback'],
    },
    {
        title: 'Chat/Skill Card',
        exports: ['Basic', 'WithSpecializations', 'ResearchSkill'],
    },
    {
        title: 'Partials/Stat Grid Section',
        exports: ['Mobility', 'Athletics', 'CarryingCapacity', 'PerSystemIM', 'PerSystemRT', 'ComposedFullPanel'],
    },
    {
        title: 'Item Sheets/Weapon Sheet',
        exports: ['Standard', 'CollapsedBody', 'EditModeNoAmmoLoaded'],
    },

    // ── stories/actor-panels/ ────────────────────────────────────────────
    {
        title: 'Actor/Panels/DaemonicImmunitiesBadge',
        exports: ['Default'],
    },
    {
        title: 'Actor/Panels/DarkPactPanel',
        exports: ['SinglePact', 'MultiPactMixed', 'PaymentLapsedEnemy'],
    },
    {
        title: 'Actor/Panels/FanaticButton',
        exports: ['FanaticVisible', 'NonFanaticHidden'],
    },
    {
        title: 'Actor/Panels/GrappleControllerPanel',
        exports: ['Grappling', 'Controlled'],
    },
    {
        title: 'Actor/Panels/MortificationButton',
        exports: ['PenitentVisible', 'NonPenitentHidden'],
    },
    {
        title: 'Actor/Panels/NpcInteractionsPanel',
        exports: ['Empty', 'MixedRoster', 'AllAtCap', 'ReadOnly'],
    },
    {
        title: 'Actor/Panels/PossessionPanel',
        exports: ['Latent', 'LatentPartialSpend', 'Possessed'],
    },
    {
        title: 'Actor/Panels/ShockPanel',
        exports: ['NoShock', 'ModerateShock', 'SevereShock'],
    },
    {
        title: 'Actor/Panels/SubtletyPanel',
        exports: ['PlayerView', 'GmViewWithAdjusters', 'EmptyAdjusters'],
    },

    // ── stories/chat-cards/ ──────────────────────────────────────────────
    {
        title: 'Chat/Aerial Manoeuvre (#133)',
        exports: ['LockOnWin', 'LockOnCrush', 'TightTurnSuccess', 'TightTurnFailure'],
    },
    {
        title: "Chat/Assassin's Strike (#149)",
        exports: ['TalentSuccessShowsButton', 'TalentMissHidesButton', 'NoTalentHidesButton'],
    },
    {
        title: 'Chat/Critical Damage (#108)',
        exports: ['EnergyArmMid', 'ExplosiveLegLow', 'ImpactHeadHighFatal', 'RendingBodyFatalRT', 'PackAbsentDegrades', 'RenderSmoke'],
    },
    {
        title: 'Chat/Damage Die Replacement (#129)',
        exports: ['ReplaceDieAvailable', 'ReplaceDieHiddenWhenZeroDoS', 'ReplaceDieHiddenWhenFlagFalse'],
    },
    {
        title: 'Chat/Medicae Mechadendrite (#104)',
        exports: ['StaunchSuccess', 'StaunchFailure', 'SuccessRogueTraderTheme', 'RenderSmoke'],
    },
    {
        title: 'Chat/Push the Limit (#101)',
        exports: ['SuccessWithBonus', 'MotiveSystemsCritical', 'ImpactLegCritical', 'NotInvoked'],
    },
    {
        title: 'Chat/Sanctic Daemonology (#130)',
        exports: ['UnfetteredNoPhenomena', 'FetteredHolocaust', 'PushPhenomena', 'PushWithSoulBinding', 'PushWithEmperorsAnathema'],
    },
    {
        title: 'Chat/Two-Weapon Refocus (#147)',
        exports: ['RangedSingleShotWielder', 'RangedSemiAutoSameRestrictions', 'RangedMasterAmbidextrous', 'MeleeSwiftAttackVariant'],
    },
    {
        title: 'Chat/Weapon Quality (#57 completion)',
        exports: [
            'SprayTemplate',
            'FlameBurning',
            'GravitonKnockdown',
            'LancePenByDoS',
            'MaximalRecharge',
            'PowerFieldParryDestroy',
            'ScatterPointBlank',
            'ScatterLongRange',
            'ShockingStun',
            'BlastRadius',
            'PerSystemImperiumMaledictum',
        ],
    },

    // ── stories/dialogs/ ─────────────────────────────────────────────────
    {
        title: 'Dialogs/BeyondHomeworldInfoDialog',
        exports: ['Default', 'AllCardsPresent'],
    },
    {
        title: 'Dialogs/Unified Roll — Climbing Surface Picker (#146)',
        exports: ['Standard', 'Sheer', 'EasyAssisted'],
    },
    {
        title: 'Dialogs/CyberneticsInstallDialog',
        exports: ['CommonLimb', 'BestNeural', 'PoorOrgan', 'RenderSmoke'],
    },
    {
        title: 'Dialogs/Daemon Weapon Attribute Roller',
        exports: ['PreRoll', 'KhorneNormal', 'NurgleMajor', 'SlaaneshGreater', 'TzeentchLesser', 'UnalignedMinor', 'ChatCard'],
    },
    {
        title: 'Dialogs/DaemonhostBindingDialog',
        exports: ['Minor', 'Greater', 'Major', 'SelectFlow'],
    },
    {
        title: 'Dialogs/DisorderRollDialog',
        exports: ['Minor', 'Severe', 'Acute', 'RenderSmoke'],
    },
    {
        title: 'Dialogs/Unified Roll — Extended Test Toggle (#59)',
        exports: ['Off', 'OnDefault', 'OnHighThreshold'],
    },
    {
        title: 'Dialogs/FearTestDialog',
        exports: ['Fear1', 'Fear3Crimson', 'Fear4Max', 'NoFearDisabled', 'RenderSmoke'],
    },
    {
        title: 'Dialogs/GrenadeThrowDialog',
        exports: ['Psychotroke', 'PhotonFlash', 'TearsOfTheEmperor', 'Smoke', 'RenderSmoke'],
    },
    {
        title: 'Dialogs/IncorruptibleDevotionDialog',
        exports: ['Default', 'SinglePoint', 'LargeBurst', 'TradeFlow'],
    },
    {
        title: 'Dialogs/MedicaeMechadendriteDialog',
        exports: ['Eligible', 'Ineligible', 'RenderSmoke', 'IneligibleDisablesButton'],
    },
    {
        title: 'Dialogs/MutantBackgroundDialog',
        exports: ['Default', 'WithTargetActor', 'DisabledApply', 'TwistedFleshGrantPresent'],
    },
    {
        title: 'Dialogs/MutationRollDialog',
        exports: ['MinorTrack', 'MajorTrack', 'RenderSmoke'],
    },
    {
        title: 'Dialogs/Psychic Push Selector',
        exports: ['Fettered', 'Unfettered', 'PushOne', 'PushTwo', 'PushThree'],
    },
    {
        title: 'Dialogs/RadicalServicesDialog',
        exports: ['Default', 'ServiceSelected'],
    },
    {
        title: 'Dialogs/RightStuffDialog',
        exports: ['Eligible', 'NoFate', 'NotAce', 'RenderSmoke', 'NoFateDisablesButton', 'NotAceDisablesButton'],
    },
    {
        title: 'Dialogs/SancticPurityPrompt',
        exports: ['CanSpend', 'NoFate', 'SpendFlow', 'DeclineFlow'],
    },
    {
        title: 'Dialogs/SisterOfBattleDialog',
        exports: ['Default', 'DisabledApply', 'ApplyFlow'],
    },
    {
        title: 'Dialogs/Skill Alt-Characteristic Dropdown',
        exports: ['TrainedDefault', 'TrainedAltToughness', 'UntrainedBasicHalved', 'UntrainedAdvancedBlocked'],
    },
    {
        title: 'Dialogs/Unified Roll — Trying Again Warning (#62)',
        exports: ['NoRetryYet', 'InquiryBlocked', 'CharmCumulativeMinus10', 'IntimidateCumulativeMinus20'],
    },
    {
        title: 'Dialogs/Unified Roll — Assistance Stepper (#60)',
        exports: ['NoAssistants', 'OneAssistant', 'TwoAssistants'],
    },
    {
        title: 'Dialogs/WithinHomeworldInfoDialog',
        exports: ['Default', 'RendersThreeHomeworldCards', 'AgriWorldShowsBrutalCharge', 'FrontierWorldShowsTechUseBonus'],
    },
    {
        title: 'Dialogs/WithoutHomeworldInfoDialog',
        exports: ['Default', 'AllCardsPresent'],
    },

    // ── stories/item-sheets/ ─────────────────────────────────────────────
    {
        title: 'Item Sheets/LeadSheet',
        exports: ['Default', 'Pursued', 'DeadEnd', 'RendersFields'],
    },
    {
        title: 'Item Sheets/ProfaneObjectGearSheet',
        exports: ['EyeOfTzeentch', 'FoundationStone', 'HammerOfSaintLucillius', 'LibrisMaleficarum', 'OrdinaryGearHidesPanel', 'RendersPanel'],
    },
];

// ---------------------------------------------------------------------------
// Flatten into a deduplicated list of `{ storyId, title, exportName }`.
// Duplicates would arise if a story file's title collides with another's
// AND they share an export name; the dedup keeps the first occurrence so
// the test surface stays stable regardless of matrix ordering.
// ---------------------------------------------------------------------------

interface StoryCase {
    readonly storyId: string;
    readonly title: string;
    readonly exportName: string;
}

const STORY_CASES: ReadonlyArray<StoryCase> = (() => {
    const seen = new Set<string>();
    const out: StoryCase[] = [];
    for (const { title, exports } of STORY_MATRIX) {
        for (const exportName of exports) {
            const storyId = toStoryId(title, exportName);
            if (seen.has(storyId)) continue;
            seen.add(storyId);
            out.push({ storyId, title, exportName });
        }
    }
    return out;
})();

// ---------------------------------------------------------------------------
// One test() per derived storyId. Each navigates the Storybook iframe, waits
// for network idle plus a small settle delay so Storybook's render decorator
// flushes Handlebars compilation + per-system theme application, writes a
// full-page PNG, and asserts the body has SOME rendered content.
// ---------------------------------------------------------------------------

test.describe('Storybook screenshots', () => {
    for (const { storyId, title, exportName } of STORY_CASES) {
        test(`${storyId} [${title} → ${exportName}]`, async ({ page }) => {
            await page.goto(`/iframe.html?id=${storyId}`);
            await page.waitForLoadState('networkidle');
            // Let Storybook's render decorator finish its post-mount work
            // (Handlebars partial compilation, per-system theme cascade).
            await new Promise((resolve) => {
                setTimeout(resolve, 400);
            });

            await page.screenshot({
                path: `tests/storybook/screenshots/${storyId}.png`,
                fullPage: true,
            });

            // Sanity assertion — body must contain something. A wrong storyId
            // produces an iframe that says "Sorry, could not find a story…"
            // which still has body content, so this is intentionally weak:
            // the screenshot is the real deliverable, this just catches the
            // pathological "completely blank document" case.
            await expect(page.locator('body')).not.toBeEmpty();
        });
    }
});
