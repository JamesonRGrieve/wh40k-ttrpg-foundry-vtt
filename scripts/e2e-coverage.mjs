#!/usr/bin/env node
// Coverage report for Tier B e2e tests. Three layers:
//   1. Pass/fail counts from Playwright's JSON reporter (.e2e-results.json).
//   2. Per-dimension surface coverage % (covered surfaces / enumerable).
//      Inputs: .e2e-inventory.json + .e2e-runtime-coverage.jsonl.
//   3. Real source-code coverage on src/module/**/*.ts (lines, statements,
//      functions, branches) — computed by scripts/e2e-source-coverage.mjs
//      from per-test v8 dumps in .e2e-raw-coverage/.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RESULTS = '.e2e-results.json';
const INVENTORY = '.e2e-inventory.json';
const RUNTIME = '.e2e-runtime-coverage.jsonl';
const OUTPUT = '.e2e-coverage.json';

if (!existsSync(RESULTS)) {
    console.error(`e2e:coverage — ${RESULTS} missing. Run \`pnpm test:e2e\` first.`);
    process.exit(2);
}

// --- pass/fail roll-up from Playwright JSON ---
const report = JSON.parse(readFileSync(RESULTS, 'utf8'));
let passed = 0;
let failed = 0;
let skipped = 0;
let timedOut = 0;
const perSpec = {};

function walk(suites) {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) {
        const file = suite.file ?? 'unknown';
        for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
                const last = test.results?.[test.results.length - 1];
                const status = last?.status ?? 'unknown';
                perSpec[file] ??= { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
                if (status === 'passed') {
                    passed++;
                    perSpec[file].passed++;
                } else if (status === 'failed') {
                    failed++;
                    perSpec[file].failed++;
                } else if (status === 'skipped') {
                    skipped++;
                    perSpec[file].skipped++;
                } else if (status === 'timedOut') {
                    timedOut++;
                    perSpec[file].timedOut++;
                }
            }
        }
        walk(suite.suites);
    }
}
walk(report.suites);

// --- per-dimension coverage % from inventory + runtime tracker ---
let inventory = null;
if (existsSync(INVENTORY)) {
    try {
        inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
    } catch (err) {
        console.warn(`e2e:coverage — ignoring malformed ${INVENTORY}: ${err.message}`);
    }
}

const covered = {}; // { dimension: Set<key> }
if (existsSync(RUNTIME)) {
    const lines = readFileSync(RUNTIME, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
        try {
            const { dimension, key } = JSON.parse(line);
            covered[dimension] ??= new Set();
            covered[dimension].add(key);
        } catch {
            /* skip bad line */
        }
    }
}

const dimensions = {};
function recordDimension(name, coveredSet, enumerableSet) {
    const c = coveredSet ?? new Set();
    const t = new Set(enumerableSet);
    const missing = [...t].filter((k) => !c.has(k));
    const extra = [...c].filter((k) => !t.has(k));
    dimensions[name] = {
        covered: c.size,
        total: t.size,
        percent: t.size === 0 ? 0 : Math.round((c.size / t.size) * 10000) / 100,
        missing,
        extra,
    };
}

// Public Actor roll methods exercised by tests/e2e/roll-methods.spec.ts.
// Enumerated explicitly because they live on document subclasses, not on
// `CONFIG.Actor.*`, so they would never appear in `.e2e-inventory.json`.
// Adding a new roll method to base-actor.ts / acolyte.ts means adding it
// here AND to the ROLL_METHODS tuple in the spec — both must agree for
// the coverage denominator to be honest.
const ACTOR_ROLL_METHODS = ['rollCharacteristic', 'rollCharacteristicCheck', 'rollSkill', 'rollCheck', 'rollItem', 'rollWeaponAction', 'rollPsychicPower'];

// Public Item document roll methods exercised by tests/e2e/item-rolls.spec.ts.
// Enumerated explicitly because they live on the Item document subclass, not
// on `CONFIG.Item.*` data models. Adding a new roll method to item.ts means
// adding it here AND in the ITEM_ROLL_SPECS table in the spec.
const ITEM_ROLL_METHODS = ['rollTalent', 'rollNavigatorPower', 'rollOrder', 'rollRitual'];

// im-character actor creation is currently broken in the build under test;
// the spec skips it, so we subtract those pairs from the denominator rather
// than counting them as permanent misses.
const BROKEN_ROLL_METHOD_SYSTEMS = new Set(['im']);

// Sheet-interaction surfaces exercised by tests/e2e/sheet-interactions.spec.ts.
// Hand-enumerated for the same reason as ACTOR_ROLL_METHODS / ITEM_ROLL_METHODS
// — these are sheet-instance surfaces (DEFAULT_OPTIONS.actions, static TABS,
// form-submit endpoints), not document-layer config the inventory dump can
// see. Keys MUST match the recordCoverage('sheet.*', ...) calls in the spec
// so adding a new tab / action / submitted field extends the denominator
// here in the same change.
const CHARACTER_SHEET_TABS = ['overview', 'skills', 'combat', 'equipment', 'biography'];
const CHARACTER_SHEET_ACTIONS = ['toggleEditMode', 'resetWindowSize'];
const CHARACTER_SHEET_FORM_FIELDS = ['system.wounds.value'];

// Sheet-mixin layer flows exercised by tests/e2e/sheet-mixins.spec.ts. Drives
// source coverage on `src/module/applications/api/primary-sheet-mixin.ts`
// (edit-mode toggle / changeTab routing / _activateTab DOM dispatch),
// `src/module/applications/item/base-item-sheet.ts` (isCompendiumItem /
// isOwnedByActor / canEdit / inEditMode getters + #toggleEditMode action),
// and `src/module/applications/actor/base-actor-sheet.ts` (_onDropItem
// drop-handler override + tabGroups round-trip). The ProseMirror gating
// flow guards CLAUDE.md gotcha #5 by verifying compendium item sheets
// short-circuit before instantiating a ProseMirror editor in read-only
// context. Keys MUST match the recordCoverage('sheet-mixin.flow', ...)
// calls in the spec.
const SHEET_MIXIN_FLOWS = [
    'edit-mode-toggle-actor',
    'edit-mode-toggle-item',
    'owned-item-sheet-canEdit',
    'compendium-item-sheet-readonly',
    'tab-switch-routes-via-mixin',
    'drop-event-on-sheet',
    'prosemirror-gated-in-readonly',
];

// Foundry hooks the wh40k-rpg system registers handlers for. Exercised by
// tests/e2e/hooks.spec.ts — each entry has a trigger action in that spec
// AND a recordCoverage('hook.fired', name) call. Keep this list in sync
// with EXERCISED_HOOKS in the spec; the spec's denominator and this one
// MUST agree. Hooks that fire only in environments not reachable from a
// headless world (renderTokenHUD without a placed token, hotbarDrop
// without canvas drag-drop, sheet-config renders, directory renders that
// need a sidebar interaction) are intentionally omitted — better an
// honest denominator than a fake percentage.
const EXERCISED_HOOKS = [
    'init',
    'ready',
    'renderChatMessageHTML',
    'updateActor',
    'updateItem',
    'combatStart',
    'combatTurn',
    'combatRound',
    'deleteCombat',
    'getSceneControlButtons',
];

// WH40K system settings registered by `WH40KSettings.registerSettings()`
// in src/module/wh40k-rpg-settings.ts. Hand-enumerated here so the
// settings.spec.ts denominator is independent of the inventory dump (the
// inventory does not yet enumerate settings; if/when it does, we can
// pivot to `inventory.settings ?? SYSTEM_SETTING_KEYS`). Adding a new
// `game.settings.register(SYSTEM_ID, key, ...)` call means adding the
// short key here so the dimension percentage stays honest.
const SYSTEM_SETTING_KEYS = [
    'world-version',
    'simple-attack-rolls',
    'simple-psychic-rolls',
    'active-effects-during-combat',
    'combat-presets',
    'movement-automation',
    'dh2-ruleset',
    'characteristic-offset',
    'resync-on-ready',
    'multiple-fate-burn-per-roll',
    'auto-psychic-phenomena',
];

// Static accessors on `WH40KSettings` exercised by settings.spec.ts.
// These drive the read-site branches (`isHomebrew` / `getRuleset` /
// `getCharacteristicOffset` / `getCharacteristicBase` /
// `isMultipleFateBurnAllowed`) so source-code coverage on
// src/module/wh40k-rpg-settings.ts reflects both register-site lines
// and accessor branches. Keep in sync with SETTING_ACCESSORS in the spec.
const SETTING_ACCESSORS = ['isHomebrew', 'getRuleset', 'getCharacteristicOffset', 'getCharacteristicBase', 'isMultipleFateBurnAllowed'];

// Chat-card templates exercised by tests/e2e/chat-cards.spec.ts. Hand-
// enumerated for the same reason as ACTOR_ROLL_METHODS — these are
// `.hbs` files under `src/templates/chat/`, not entries in any
// `CONFIG.*` registry, so the inventory dump can't see them. Keep this
// list in sync with `CHAT_TEMPLATES` in the spec (basenames, no `.hbs`).
// Partials under `partial/` are intentionally excluded — they render
// transitively via their parent cards and are not addressable as
// standalone chat content.
const CHAT_TEMPLATES = [
    'acquisition-test',
    'action-roll-chat',
    'armour-card-chat',
    'assign-damage-chat',
    'bleeding-chat',
    'burning-chat',
    'combat-action-card',
    'condition-card',
    'critical-injury-card',
    'damage-roll-chat',
    'force-field-roll-chat',
    'item-card-chat',
    'item-vocalize-chat',
    'movement-card',
    'navigator-power-chat',
    'order-roll-chat',
    'origin-roll-card',
    'psychic-action-chat',
    'reload-action-chat',
    'ritual-roll-chat',
    'ship-weapon-chat',
    'simple-roll-chat',
    'skill-card',
    'talent-card',
    'talent-roll-chat',
    'trait-card',
    'weapon-card-chat',
];

// Dialog & prompt classes shipped under src/module/applications/dialogs/**
// and src/module/applications/prompts/**, exercised by tests/e2e/dialogs.spec.ts.
// Each entry corresponds to one `recordCoverage('dialog.render', <ClassName>)`
// call in the spec; DIALOG_PROBES in the spec and this constant MUST stay in
// sync. Hand-enumerated because these are class names exported from source
// files, not Foundry config the inventory dump can see — adding a new dialog
// means adding its class name to both DIALOG_PROBES (spec) and here.
const DIALOG_AND_PROMPT_CLASSES = [
    // dialogs/
    'AcquisitionDialog',
    'AdvancementDialog',
    'AmmoPickerDialog',
    'CharacteristicSetupDialog',
    'ConfirmationDialog',
    'ConvertActorSystemDialog',
    'WH40KCreateActorDialog',
    'FateUsesDialog',
    'RollConfigurationDialog',
    'TransactionRequestDialog',
    // prompts/
    'AddXPDialog',
    'AssignDamageDialog',
    'BaseRollDialog',
    'DamageRollDialog',
    'EffectCreationDialog',
    'EnhancedSkillDialog',
    'ForceFieldDialog',
    'PsychicPowerDialog',
    'RighteousFuryDialog',
    'SimpleRollDialog',
    'SpecialistSkillDialog',
    'UnifiedRollDialog',
    'WeaponAttackDialog',
];

// ActiveEffect direct-creation flows exercised by tests/e2e/active-effects.spec.ts.
// Distinct from `condition.toggle` (which covers the status-icon toggle path
// against `CONFIG.statusEffects`) — these flows create custom AE documents
// directly on an actor (or on an embedded item, for the transfer probe) and
// assert behavioural outcomes against `src/module/documents/active-effect.ts`:
// each change-mode branch in `_applyChangeValue`, the transfer pipeline, the
// `remainingDuration` getter under combat advance, the `disabled` gate, and
// post-delete rollback of derived data. Keys MUST match the
// recordCoverage('active-effect.flow', ...) calls in the spec.
const ACTIVE_EFFECT_FLOWS = [
    'add-mode',
    'multiply-mode',
    'override-mode',
    'upgrade-mode',
    'downgrade-mode',
    'custom-mode',
    'transfer',
    'temporary-duration',
    'disabled',
    'delete-rollback',
];

// Combat tracker lifecycle flows exercised by tests/e2e/combat.spec.ts.
// Each key is a step in the full encounter lifecycle (create → add
// combatants → roll → activate → start → advance turns/rounds → mutate
// initiative → drop a combatant → end). Pushes source-code coverage on
// `src/module/actions/combat-action-manager.ts` (combatTurn / combatRound
// hook handlers) and the V14 Combat document update pipeline. Keys MUST
// match the recordCoverage('combat.flow', ...) calls in the spec.
const COMBAT_FLOWS = [
    'create',
    'addCombatants',
    'rollAll',
    'activate',
    'startCombat',
    'nextTurn',
    'nextRound',
    'setInitiative',
    'deleteCombatant',
    'endCombat',
];

// Combat-adjacent ApplicationV2 classes exercised by tests/e2e/combat.spec.ts.
// Each is constructed and rendered directly to push source-code coverage on
// the application class file (constructor + _prepareContext + _onRender +
// PARTS registration). Keys MUST match the recordCoverage('combat.ui', ...)
// calls in the spec.
const COMBAT_UI_CLASSES = ['CombatQuickPanel', 'EncounterBuilder', 'CombatPresetDialog', 'DifficultyCalculatorDialog', 'NPCThreatScalerDialog'];

// Token document + scene-embedded token lifecycle flows exercised by
// tests/e2e/token.spec.ts. Each key is a step in the scene/token lifecycle
// (create scene → place token → resolve artwork → move → override actor
// delta → toggle actor link → delete). Pushes source-code coverage on
// `src/module/documents/token.ts` (TokenDocumentWH40K — the class registered
// as CONFIG.Token.documentClass that every embedded scene token instantiates)
// and indirectly on the hooks-manager registration paths that wire the class
// into Foundry. Keys MUST match the recordCoverage('token.flow', ...) calls
// in the spec.
const TOKEN_FLOWS = [
    'scene-create-and-token-place',
    'token-default-artwork',
    'token-update-position',
    'token-delete',
    'token-overrides-actor-data',
    'token-actor-link',
];

// Subtlety adjuster flows exercised by tests/e2e/subtlety.spec.ts. Pushes
// source-code coverage on src/module/rules/subtlety-adjusters.ts
// (`clampSubtletyLoss`, `isSubtletyPrimitive`, the primitive branches in
// `subtletySourceLabel`), src/module/data/shared/subtlety-adjuster.ts
// (`subtletyAdjusterEffectOf` — `none` / `clamp` / `passive` / `event`
// branches), and src/module/data/shared/subtlety-adjuster-template.ts
// (`defineSchema()` + the `subtletyAdjusterEffect` getter). Indirectly drives
// `applySubtlety` / `applySubtletyFromSource` / `collectSubtletyAdjusters`
// on base-actor.ts. Keys MUST match the recordCoverage('subtlety.flow', ...)
// calls in the spec.
const SUBTLETY_FLOWS = [
    'subtlety-baseline',
    'subtlety-manual-adjustment',
    'subtlety-inquest-adjustment',
    'talent-subtlety-delta-applies',
    'talent-subtlety-requiresEquipped',
    'subtlety-minAbsoluteDelta-floors',
    'subtlety-clears-when-removed',
];

// Damage / health / fatigue / fate pipeline flows exercised by
// tests/e2e/damage.spec.ts. Drives source-code coverage on
// `src/module/documents/base-actor.ts` (applyFatigue, fate getters),
// `src/module/documents/acolyte.ts` (spendFate override), and
// `src/module/documents/npc.ts` (applyDamage + healWounds). Keys MUST
// match the recordCoverage('damage.flow', ...) calls in the spec.
const DAMAGE_FLOWS = [
    'deal-damage-reduces-wounds',
    'wounds-zero-marks-critical',
    'fatigue-accumulation',
    'fate-spend-decrements-value',
    'fate-burn-decrements-max',
    'wound-recovery',
    'multi-step-damage-fatigue',
];

// Modifier / equipment-effect pipeline flows exercised by
// tests/e2e/modifiers.spec.ts. Each key embeds an item (talent / armour /
// weapon / gear) that contributes modifiers via ModifiersTemplate or a
// transferred ActiveEffect, then reads the actor's prepared derived data to
// confirm the change lands. Pushes source-code coverage on
// `src/module/data/shared/modifiers-template.ts`,
// `src/module/data/actor/templates/creature.ts` (_computeItemModifiers,
// _applyItemModifiers, _applyModifiersToCharacteristics,
// _applyModifiersToSkills, _computeArmour) and
// `src/module/utils/armour-calculator.ts`. Keys MUST match the
// recordCoverage('modifier.flow', ...) calls in the spec.
const MODIFIER_FLOWS = [
    'talent-modifier-applies',
    'armour-equipped-grants-AP',
    'weapon-equipped-active-effect',
    'unequip-removes-modifier',
    'stackable-modifier-stacks',
    'modifier-on-skill',
    'modifier-condition-applied',
];

// Dark-Heresy-flavoured item DataModel flows exercised by
// tests/e2e/dh-special-items.spec.ts. Each key embeds one item type with
// unique mechanics onto a dh2-character parent and drives the per-type
// defineSchema + getters + prepareBaseData branches that the basic
// item-types.spec.ts create+render sweep doesn't reach. Pushes source-code
// coverage on `src/module/data/item/mutation.ts`, `mental-disorder.ts`,
// `critical-injury.ts`, `malignancy.ts`, `gear.ts` (drug → GearData),
// `peer-enemy.ts` (peer → PeerEnemyData), and `cybernetic.ts` (including
// the `cybernetic && equipped` branch of CreatureTemplate._computeItemModifiers
// at `src/module/data/actor/templates/creature.ts:1089`). Keys MUST match
// the recordCoverage('dh-special-item.flow', ...) calls in the spec.
const DH_SPECIAL_ITEM_FLOWS = [
    'mutation-applies-to-actor',
    'mental-disorder-tracks-severity',
    'critical-injury-applies-impairment',
    'malignancy-corruption-link',
    'drug-temporary-effect',
    'peer-grants-influence-test-bonus',
    'cybernetic-grants-stat-modifier',
];

// Vehicle + starship gameplay flows exercised by
// tests/e2e/vehicle-starship.spec.ts. Drives source-code coverage on
// `src/module/data/actor/vehicle.ts` (integrity clamp / derived getters /
// _applyVehicleTraitModifiers / altitude write-back),
// `src/module/data/actor/starship.ts` (_prepareResources /
// _prepareCombatStats / prepareEmbeddedData walk over shipComponent /
// shipWeapon / shipUpgrade items), and the vehicle-sheet /
// starship-sheet item-bucketing branches. Keys MUST match the
// recordCoverage('vehicle-starship.flow', ...) calls in the spec.
const VEHICLE_STARSHIP_FLOWS = [
    'vehicle-hull-damage',
    'vehicle-crew-management',
    'vehicle-altitude-profile',
    'starship-component-install',
    'starship-crew-morale',
    'starship-hull-and-shields',
    'vehicle-weapon-fire',
];

if (inventory) {
    // validActorTypeSystemPairs is the per-system-prefixed enumeration —
    // `dh2-character::dh2` counts, `dh2-character::bc` does not (would never
    // be createable). Falls back to the cross-product for older inventory
    // files that predate the prefix-aware build.
    const pairs = Array.isArray(inventory.validActorTypeSystemPairs)
        ? inventory.validActorTypeSystemPairs
        : inventory.actorTypes.flatMap((t) => (inventory.gameSystems ?? []).map((s) => `${t}::${s}`));
    recordDimension('actor.type-system', covered['actor.type-system'], pairs);
    recordDimension('actor.sheet-render', covered['actor.sheet-render'], pairs);
    recordDimension('item.type', covered['item.type'], inventory.itemTypes ?? []);
    recordDimension('item.sheet-render', covered['item.sheet-render'], inventory.itemTypes ?? []);
    recordDimension('condition.toggle', covered['condition.toggle'], inventory.statusEffects ?? []);
    recordDimension('compendium.pack-read', covered['compendium.pack-read'], inventory.compendiumPacks ?? []);

    const rollMethodPairs = [];
    for (const method of ACTOR_ROLL_METHODS) {
        for (const sys of inventory.gameSystems ?? []) {
            if (BROKEN_ROLL_METHOD_SYSTEMS.has(sys)) continue;
            rollMethodPairs.push(`${method}::${sys}`);
        }
    }
    recordDimension('actor.roll-method', covered['actor.roll-method'], rollMethodPairs);

    // Item roll methods are system-agnostic at the document layer — one
    // sweep, no per-system cross-product.
    recordDimension('item.roll-method', covered['item.roll-method'], ITEM_ROLL_METHODS);
}

// Sheet-interaction dimensions exercised by tests/e2e/sheet-interactions.spec.ts.
// Each key is `${sheetSlug}::${surface}` so future sheet expansion (npc, item
// sheets) extends the same dimensions instead of forking new ones.
recordDimension(
    'sheet.tab',
    covered['sheet.tab'],
    CHARACTER_SHEET_TABS.map((t) => `character::${t}`),
);
recordDimension(
    'sheet.action',
    covered['sheet.action'],
    CHARACTER_SHEET_ACTIONS.map((a) => `character::${a}`),
);
recordDimension(
    'sheet.form-submit',
    covered['sheet.form-submit'],
    CHARACTER_SHEET_FORM_FIELDS.map((f) => `character::${f}`),
);

// Sheet-mixin layer dimension exercised by tests/e2e/sheet-mixins.spec.ts.
// Pushes source coverage on the primary-sheet-mixin + base-item-sheet +
// base-actor-sheet trio (edit-mode getters / toggle action, mixin changeTab
// routing, _onDropItem drop dispatch, compendium read-only / ProseMirror
// gating). See SHEET_MIXIN_FLOWS above for the per-flow source-coverage map.
recordDimension('sheet-mixin.flow', covered['sheet-mixin.flow'], SHEET_MIXIN_FLOWS);

// DH2-specific gameplay surfaces exercised by tests/e2e/dh2-flows.spec.ts.
// Each is a single-key dimension (0% or 100%) — the goal is to ratchet
// presence of a probe for the surface, not to enumerate every possible
// state. Add a key here AND a recordCoverage(...) call in the spec.
recordDimension('hook.fired', covered['hook.fired'], EXERCISED_HOOKS);

// Settings dimensions exercised by tests/e2e/settings.spec.ts. The union
// of `setting.toggle` (writable booleans + choice strings) and
// `setting.read` (requiresReload + non-flippable types) is the total
// settings surface; we report them as separate dimensions so a regression
// that silently demotes a toggleable setting to read-only is visible.
recordDimension('setting.toggle', covered['setting.toggle'], SYSTEM_SETTING_KEYS);
recordDimension('setting.read', covered['setting.read'], SYSTEM_SETTING_KEYS);
recordDimension('setting.accessor', covered['setting.accessor'], SETTING_ACCESSORS);

// Chat-card render dimension exercised by tests/e2e/chat-cards.spec.ts.
// One key per non-partial template under src/templates/chat/. Pushes
// source-code coverage on `src/templates/chat/**/*.hbs` and on the
// `renderChatMessageHTML` hook in `src/module/actions/basic-action-manager.ts`.
recordDimension('chat.card-render', covered['chat.card-render'], CHAT_TEMPLATES);

// Dialog & prompt render dimension exercised by tests/e2e/dialogs.spec.ts.
// One key per shipped class. Pushes source-code coverage on
// src/module/applications/dialogs/**/*.ts and src/module/applications/prompts/**/*.ts
// (constructor + _prepareContext + _renderHTML paths that no other spec hits).
recordDimension('dialog.render', covered['dialog.render'], DIALOG_AND_PROMPT_CLASSES);

// ActiveEffect flow dimension exercised by tests/e2e/active-effects.spec.ts.
// Pushes source-code coverage on `src/module/documents/active-effect.ts` —
// every branch of `_applyChangeValue`, the `apply()` key-prefix dispatcher,
// the `isTemporary` / `remainingDuration` getters, and the transfer
// pipeline that mounts an item's effects onto its parent actor.
recordDimension('active-effect.flow', covered['active-effect.flow'], ACTIVE_EFFECT_FLOWS);

// Combat tracker lifecycle dimensions exercised by tests/e2e/combat.spec.ts.
// Drives source-code coverage on `src/module/actions/combat-action-manager.ts`
// (combatTurn / combatRound handler bodies) and the combat-adjacent
// ApplicationV2 surfaces under `src/module/applications/hud/combat-quick-panel.ts`
// and `src/module/applications/npc/*` (encounter builder, combat preset
// dialog, difficulty calculator dialog, NPC threat scaler dialog).
recordDimension('combat.flow', covered['combat.flow'], COMBAT_FLOWS);
recordDimension('combat.ui', covered['combat.ui'], COMBAT_UI_CLASSES);

// Combat attack→damage→audit flow exercised by tests/e2e/combat-attack-flow.spec.ts.
// Drives source coverage on the combat-fix merge: base-actor `rollWeaponAttack`,
// the `auto-roll-damage` setting, `action-data.ts` maybeAutoRollDamage gating,
// and the action-card audit row. Keep in sync with COMBAT_ATTACK_FLOWS in the spec.
const COMBAT_ATTACK_FLOWS = ['roll-weapon-attack-defined', 'auto-roll-damage-setting', 'auto-damage-gating', 'audit-row-renders'];
recordDimension('combat.attack-flow', covered['combat.attack-flow'], COMBAT_ATTACK_FLOWS);

// Character-generation modes (point-buy + roll) exercised by
// tests/e2e/char-gen-modes.spec.ts. Keep in sync with CHAR_GEN_MODES there.
const CHAR_GEN_MODES = ['mode-tabs-present', 'point-buy-mode-renders', 'roll-mode-renders'];
recordDimension('char-gen.mode', covered['char-gen.mode'], CHAR_GEN_MODES);

// Token + scene-embedded token document dimension exercised by
// tests/e2e/token.spec.ts. Drives source-code coverage on
// `src/module/documents/token.ts` (TokenDocumentWH40K, the registered
// CONFIG.Token.documentClass) — each scene token instance is an instance
// of this subclass, so its update / delete / actorLink toggle paths
// exercise the subclass's _preUpdate / _onUpdate / delta-resolution
// branches that no other spec hits.
recordDimension('token.flow', covered['token.flow'], TOKEN_FLOWS);

// Subtlety adjuster dimension exercised by tests/e2e/subtlety.spec.ts.
// Direction #7: per-flow drive of the content-agnostic adjuster surface
// (manual / inquest primitives, talent-borne event / passive / clamp
// adjusters with the equip gate and loss floor, post-delete teardown).
recordDimension('subtlety.flow', covered['subtlety.flow'], SUBTLETY_FLOWS);

// Damage pipeline dimension exercised by tests/e2e/damage.spec.ts.
// Drives source-code coverage on `src/module/documents/base-actor.ts`,
// `src/module/documents/acolyte.ts`, and `src/module/documents/npc.ts`
// (applyDamage / applyFatigue / spendFate / healWounds + the
// `prepareDerivedData` paths re-run on every actor.update).
recordDimension('damage.flow', covered['damage.flow'], DAMAGE_FLOWS);

// Modifier / equipment-effect pipeline dimension exercised by
// tests/e2e/modifiers.spec.ts. Pushes source-code coverage on the
// modifier-template + creature.prepareEmbeddedData chain (talent/trait/
// condition modifiers, equippable AP aggregation, transferred AEs, and
// the unequip rollback path that re-runs _computeItemModifiers on item
// update).
recordDimension('modifier.flow', covered['modifier.flow'], MODIFIER_FLOWS);

// Dark-Heresy-flavoured item DataModel dimension exercised by
// tests/e2e/dh-special-items.spec.ts. Pushes source-code coverage on the
// per-type DataModels under src/module/data/item/ (mutation, mental-disorder,
// critical-injury, malignancy, cybernetic, plus the drug→GearData and
// peer→PeerEnemyData type-id aliases registered in hooks-manager.ts).
recordDimension('dh-special-item.flow', covered['dh-special-item.flow'], DH_SPECIAL_ITEM_FLOWS);

// Vehicle + starship gameplay dimension exercised by
// tests/e2e/vehicle-starship.spec.ts. Pushes source-code coverage on
// `src/module/data/actor/vehicle.ts` (integrity / altitude /
// _applyVehicleTraitModifiers / derived getters),
// `src/module/data/actor/starship.ts` (prepareEmbeddedData walk over
// shipComponent / shipWeapon / shipUpgrade, _prepareResources +
// _prepareCombatStats deriving hull / morale percentages), and the
// item-bucketing branches in `src/module/applications/actor/{vehicle,starship}-sheet.ts`.
recordDimension('vehicle-starship.flow', covered['vehicle-starship.flow'], VEHICLE_STARSHIP_FLOWS);

// WH40KVehicle Document-class coverage exercised by
// tests/e2e/vehicle-methods.spec.ts. Pushes source-code coverage on
// `src/module/documents/vehicle.ts` — every public getter (faction /
// subfaction / subtype / threatLevel / armour / front / side / rear /
// availability / manoeuverability / carryingCapacity / integrity /
// speed / crew / vehicleClass / size) and the four rollItem branches
// (missing item, no user character, non-weapon warn, weapon-attack
// delegation through DHTargetedActionManager). Complements
// vehicle-starship.flow, which covers the DataModel + sheet surfaces.
const VEHICLE_METHODS_FLOWS = [
    'getter-faction',
    'getter-subfaction',
    'getter-subtype',
    'getter-threat-level',
    'getter-armour',
    'getter-front',
    'getter-side',
    'getter-rear',
    'getter-availability',
    'getter-manoeuverability',
    'getter-carrying-capacity',
    'getter-integrity',
    'getter-speed',
    'getter-crew',
    'getter-vehicle-class',
    'getter-size',
    'rollItem-missing-item',
    'rollItem-no-character',
    'rollItem-non-weapon',
    'rollItem-weapon-delegation',
];
recordDimension('vehicle-methods.flow', covered['vehicle-methods.flow'], VEHICLE_METHODS_FLOWS);

// XP gain + advancement flows exercised by tests/e2e/xp-advancement.spec.ts.
// Each key is a recordCoverage('xp.flow', ...) call in the spec. Pushes
// source-code coverage on character.ts experience schema / _prepareExperience
// / _computeExperienceSpent, creature.ts skill schema + _prepareSkills, and
// the AdvancementDialog + AddXPDialog application classes.
const XP_FLOWS = [
    'xp-earned-increments',
    'xp-spent-tracks',
    'xp-remaining-calculates',
    'add-xp-prompt-render',
    'advancement-dialog-render',
    'purchase-talent-grants-modifier',
    'purchase-skill-advance',
];
recordDimension('xp.flow', covered['xp.flow'], XP_FLOWS);

// Data-migration and compendium-resync flows exercised by
// tests/e2e/migrations.spec.ts. Pushes source-code coverage on
// `src/module/wh40k-rpg-migrations.ts` (checkAndMigrateWorld baseline write),
// `src/module/compendium-resync.ts` (resyncWorldFromCompendiums + name-index
// build path via getNameIndexFor), and DataModel `_migrateData` overrides
// (TalentData prerequisites/aptitudes/specialization migration). Keys MUST
// match the recordCoverage('migration.flow', ...) calls in the spec.
const MIGRATION_FLOWS = [
    'talent-prerequisites-string-migrates-to-structured',
    'active-effect-label-migrates-to-name',
    'system-version-migration-runs',
    'compendium-resync-runs',
    'icon-deprecation-migrates-to-img',
    'migration-doesnt-break-existing-records',
];
recordDimension('migration.flow', covered['migration.flow'], MIGRATION_FLOWS);

recordDimension('dh2.fate', covered['dh2.fate'], ['fate-track']);
recordDimension('dh2.corruption', covered['dh2.corruption'], ['corruption-track']);
recordDimension('dh2.insanity', covered['dh2.insanity'], ['insanity-track']);
recordDimension('dh2.origin-path', covered['dh2.origin-path'], ['create-and-embed']);
recordDimension('dh2.elite-advance', covered['dh2.elite-advance'], ['compendium-read']);

// OriginPathBuilder dialog flows driven by tests/e2e/origin-path-builder.spec.ts.
// Each flow drives a distinct cluster of actions in
// src/module/applications/character-creation/origin-path-builder.ts: step
// navigation (#goToStep, #goToLineage, #skipLineage), origin preview/confirm
// (#previewOriginCard, #confirmSelection), reset of in-memory state, and a
// multi-step walk through every DH2 core step. Keys MUST match the
// recordCoverage('origin-builder.flow', ...) calls in the spec.
const ORIGIN_BUILDER_FLOWS = [
    'builder-renders-step-list',
    'builder-advance-to-next-step',
    'builder-back-to-previous-step',
    'builder-select-origin-card',
    'builder-confirm-origin-embeds-on-actor',
    'builder-cancel-or-reset',
    'builder-completes-full-path',
];
recordDimension('origin-builder.flow', covered['origin-builder.flow'], ORIGIN_BUILDER_FLOWS);

// Per-system gameplay flows for the 5 non-DH2 FFG-family systems, exercised
// by tests/e2e/per-system-flows.spec.ts. One key per system covers the
// signature surface that is actually present on CharacterBaseData today
// (chaosAlignment for BC, corruption+insanity for DH1, originPath.chapter
// for DW, originPath.regiment for OW, rogueTrader.profitFactor+endeavour
// for RT). Pushes source-code coverage on
// src/module/data/actor/concrete/{bc,dh1,dw,ow,rt}-character.ts and the
// per-system config dispatch in src/module/config/game-systems/.
const PER_SYSTEM_FLOWS = ['bc-infamy', 'dh1-corruption-insanity', 'dw-renown-and-chapter', 'ow-comrades-and-regiment', 'rt-profit-factor-and-dynasty'];
recordDimension('per-system.flow', covered['per-system.flow'], PER_SYSTEM_FLOWS);

// Wealth / currency mechanic flows exercised by tests/e2e/wealth.spec.ts.
// One key per system's signature currency track (Influence for DH1/DH2,
// Requisition for DW/OW, throneGelt for BC, Profit Factor spending for RT)
// plus the AcquisitionDialog construction + _prepareContext + _logAcquisition
// + PF critical-failure decrement flow. Pushes source-code coverage on
// src/module/data/actor/character.ts (the shared influence / requisition /
// throneGelt / rogueTrader.profitFactor schema fields + their update paths)
// and src/module/applications/dialogs/acquisition-dialog.ts (constructor +
// availability/craftsmanship modifier tables + flag-backed history log).
// Keys MUST match the recordCoverage('wealth.flow', ...) calls in the spec.
const WEALTH_FLOWS = [
    'dh2-influence-track',
    'dh1-influence-track',
    'dw-requisition-track',
    'ow-requisition-track',
    'bc-gelt-track',
    'rt-profit-factor-spending',
    'acquisition-dialog-flow',
];
recordDimension('wealth.flow', covered['wealth.flow'], WEALTH_FLOWS);

// CompendiumBrowser + uuid-name-cache flows exercised by
// tests/e2e/compendium-browser.spec.ts. Pushes source-code coverage on
// `src/module/applications/compendium-browser.ts` (constructor, render,
// _prepareContext, _getFilteredResults, _passesFilters search + source +
// pack-prefix branches, _onSearch, _onItemClick) and
// `src/module/utils/uuid-name-cache.ts` (build, getName hit + miss/broken,
// expandTemplates token + passthrough, isReady). Keys MUST match the
// recordCoverage('compendium-browser.flow', ...) calls in the spec.
const COMPENDIUM_BROWSER_FLOWS = [
    'browser-renders',
    'browser-filter-by-pack',
    'browser-filter-by-system',
    'browser-search-by-name',
    'browser-select-result',
    'uuid-cache-resolves-name',
    'uuid-cache-expand-templates',
    'uuid-cache-warm',
];
recordDimension('compendium-browser.flow', covered['compendium-browser.flow'], COMPENDIUM_BROWSER_FLOWS);

// GrantsManager + TransactionManager flows exercised by
// tests/e2e/managers.spec.ts. Pushes source-code coverage on
// `src/module/managers/grants-manager.ts` (applyItemGrants /
// reverseAppliedGrants / loadAppliedState / hasAppliedGrants paths via
// talent items declaring `system.grantsV2` skill + item grants, plus the
// legacy `system.grants.specialAbilities` round-trip on TalentData) and
// `src/module/transactions/transaction-manager.ts` (setMode /
// listSourcesForBuyer / listItemsForSource / prepareQuote /
// commitTransaction / #transferItem against a buyer + source actor pair
// in barter mode). Keys MUST match the recordCoverage('managers.flow', ...)
// calls in the spec.
const MANAGER_FLOWS = [
    'grants-talent-grants-skill',
    'grants-talent-grants-talent',
    'grants-revoke-on-item-delete',
    'grants-special-ability-on-actor',
    'transaction-acquire-item-from-source',
    'transaction-sell-item',
    'transaction-list-sources-for-buyer',
];
recordDimension('managers.flow', covered['managers.flow'], MANAGER_FLOWS);

// Handlebars helpers, typed i18n wrapper, uuid-name-cache helper paths,
// and the @UUID enricher pipeline exercised by tests/e2e/helpers.spec.ts.
// Pushes source-code coverage on src/module/handlebars/handlebars-helpers.ts
// (themeClassFor / select-block / concat / dhlog / isPsychicAttack /
// uuid-name / uuid-expand helper bodies), src/module/i18n/t.ts (the
// `params === undefined` short-circuit + format path), src/module/utils/
// uuid-name-cache.ts (getName + expandTemplates lookups), and the
// CONFIG.TextEditor.enrichers @UUID resolution path that
// src/module/enrichers.ts registers alongside its custom enrichers. Keys
// MUST match the recordCoverage('helper.flow', ...) calls in the spec.
const HELPER_FLOWS = [
    'handlebars-themeClassFor-helper',
    'handlebars-select-block-helper',
    'handlebars-concat-helper',
    'handlebars-dhlog-helper',
    'handlebars-isPsychicAttack',
    'handlebars-uuid-name',
    'handlebars-uuid-expand',
    'i18n-t-wrapper',
    'enricher-@UUID-resolves',
    // Extended in round-8 to push helpers/* coverage on the two modules
    // no other Tier B spec touched (skill-uuid-helper.ts at 0% / 40.9%,
    // helpers/effects.ts at 0% / 50.8%).
    'skill-uuid-helper-parseSkillName',
    'skill-uuid-helper-findSkillUuid',
    'helpers-effects-summarizeChange',
];
recordDimension('helper.flow', covered['helper.flow'], HELPER_FLOWS);

// Pure-logic calculator + utility flows exercised by tests/e2e/calculators.spec.ts.
// Pushes v8 source-code coverage on `src/module/utils/armour-calculator.ts`
// (computeArmour location aggregation + equipped-only filter),
// `src/module/utils/range-calculator.ts` (calculateRangeBracket buckets,
// applyQualityModifiers, isAtMeltaRange, calculateRangeModifier, isOutOfRange,
// formatRangeDisplay), `src/module/utils/formula-evaluator.ts`
// (evaluateWoundsFormula with characteristic refs + dice notation, parseTBMultiplier,
// parseDiceRoll, describeWoundsFormula, describeFateFormula, evaluateFateFormula
// early-returns), and `src/module/rules/subtlety-adjusters.ts` (clampSubtletyLoss
// passthrough + active-clamp + truncation branches, isSubtletyPrimitive both arms).
// Keys MUST match the recordCoverage('calculator.flow', ...) calls in the spec.
const CALCULATOR_FLOWS = [
    'armour-calculator-aggregates-locations',
    'armour-calculator-equipped-only',
    'range-calculator-band',
    'range-calculator-extreme',
    'formula-evaluator-evaluates-string',
    'formula-evaluator-with-actor-data',
    'subtlety-clamp-edge-cases',
];
recordDimension('calculator.flow', covered['calculator.flow'], CALCULATOR_FLOWS);

// Action-manager dispatch dimension exercised by tests/e2e/action-managers.spec.ts.
// Pushes source-code coverage on `src/module/actions/basic-action-manager.ts`
// (renderChatMessageHTML hook + .roll-control__* click handlers + scene-control
// assignDamage tool), `src/module/actions/combat-action-manager.ts`
// (combatTurn / combatRound hook handlers), `src/module/actions/targeted-action-manager.ts`
// (getSceneControlButtons hook handler + getSourceToken / getTargetToken /
// createSourceAndTargetData early-return branches), and
// `src/module/actions/reload-action-manager.ts` (static reloadWeapon entry
// point + findSpareAmmunition / hasSpareAmmunition / getEffectiveReloadTime
// helpers). Keys MUST match the recordCoverage('action-manager.flow', ...)
// calls in the spec.
const ACTION_MANAGER_FLOWS = [
    'basic-action-dispatch',
    'combat-action-on-turn',
    'reload-action-dispatch',
    'targeted-action-with-target',
    'scene-control-buttons-registered',
    'chat-card-button-click',
];
recordDimension('action-manager.flow', covered['action-manager.flow'], ACTION_MANAGER_FLOWS);

// Scene-controls toolbar + Token HUD overlay flows exercised by
// tests/e2e/scene-controls-hud.spec.ts. Drills into the
// `getSceneControlButtons` and `renderTokenHUD` hook PAYLOADS — where
// hooks.spec.ts only asserts firing, this dimension verifies the
// system actually installs buttons under the expected category, the
// registered onChange handlers dispatch, and the Token HUD
// `.wh40k-token-movement` button container is injected with working
// click handlers. Drives source coverage on
// `src/module/actions/basic-action-manager.ts` (assignDamage tool
// registration + assignDamageTool dispatch),
// `src/module/actions/targeted-action-manager.ts` (Attack tool
// registration + performWeaponAttack early-returns), and
// `src/module/documents/token.ts` (onTokenHUDRender button-injection
// loop + #setMovementAction click handler). `token-hud-renders` is
// canvas-gated and may not exercise without an activated scene. Keys
// MUST match the recordCoverage('scene-hud.flow', ...) calls in the spec.
const SCENE_HUD_FLOWS = [
    'scene-controls-button-registered',
    'scene-controls-button-onclick',
    'token-hud-renders',
    'token-hud-system-buttons',
    'token-effects-via-hud',
    'scene-controls-per-category',
];
recordDimension('scene-hud.flow', covered['scene-hud.flow'], SCENE_HUD_FLOWS);

// NPC tooling pipeline flows exercised by tests/e2e/npc-tools.spec.ts.
// Pushes source-code coverage on `src/module/applications/npc/stat-block-parser.ts`
// (parse / parseJSON / parseText + the _parseCharacteristics / _parseWounds /
// _parseMovement / _parseArmour / _parseSkills / _parseWeapons branches that
// fire on a sample DH2 stat block), `src/module/applications/npc/stat-block-exporter.ts`
// (toJSON + toText against a real NPC actor), `src/module/applications/npc/threat-calculator.ts`
// (scaleToThreat in both +1 and -1 directions, getTierInfo, _scaleDamage),
// `src/module/applications/npc/threat-scaler-dialog.ts` (constructor +
// #originalThreat capture + render path), `src/module/applications/npc/difficulty-calculator-dialog.ts`
// (every branch of _getDifficultyRating across ratio buckets + _prepareContext),
// `src/module/applications/npc/encounter-builder.ts` (singleton show + addNPC
// programmatic path + clear + getData snapshot), and
// `src/module/applications/npc/combat-preset-dialog.ts` (library-mode render +
// createPresetFromNPC + addPreset + getPresets + getPreset + applyPresetToNPC
// + deletePresetById round-trip via the static API surface). Keys MUST match
// the recordCoverage('npc-tool.flow', ...) calls in the spec.
const NPC_TOOL_FLOWS = [
    'stat-block-parser-imports-npc',
    'stat-block-exporter-roundtrip',
    'threat-scaler-up-and-down',
    'difficulty-calculator-computes',
    'encounter-builder-add-remove-NPCs',
    'combat-preset-save-and-load-library',
];
recordDimension('npc-tool.flow', covered['npc-tool.flow'], NPC_TOOL_FLOWS);

// Weapon-attack pipeline flows exercised by tests/e2e/weapon-attack.spec.ts.
// Pushes source-code coverage on `src/module/data/item/weapon.ts` (defineSchema
// getters: usesAmmo, isEmpty, isRangedWeapon, isMeleeWeapon; prepareDerivedData
// / _computeModifiers paths; clip + rateOfFire schema fields round-tripping
// through update writes), `src/module/applications/prompts/weapon-attack-dialog.ts`,
// `src/module/applications/prompts/damage-roll-dialog.ts` (prepareDamageRoll +
// _performRoll → Roll.evaluate + sendActionDataToChat), and
// `src/module/applications/prompts/righteous-fury-dialog.ts` (constructor +
// DEFAULT_OPTIONS + PARTS + render). Also covers
// `src/module/applications/prompts/psychic-power-dialog.ts` and the
// `src/module/documents/acolyte.ts` rollItem weapon / psychicPower branches +
// `src/module/documents/npc.ts` applyDamage armour-reduction branch. Keys MUST
// match the recordCoverage('weapon-attack.flow', ...) calls in the spec.
const WEAPON_ATTACK_FLOWS = [
    'weapon-attack-rolls-to-hit',
    'weapon-attack-consumes-ammo',
    'weapon-attack-out-of-ammo',
    'damage-roll-with-fury',
    'damage-roll-applies-armour',
    'psychic-power-roll',
    'weapon-modes',
];
recordDimension('weapon-attack.flow', covered['weapon-attack.flow'], WEAPON_ATTACK_FLOWS);

// Macro-manager flows exercised by tests/e2e/macros.spec.ts. Drives
// source-code coverage on `src/module/macros/macro-manager.ts` —
// the create-and-assign-to-hotbar paths (`createItemMacro`,
// `createSkillMacro`, `createCharacteristicMacro`) and the
// dispatch-from-hotbar paths (`rollItemMacro`, `rollSkillMacro`,
// `rollCharacteristicMacro`) wired into `game.wh40k.*` by
// `src/module/hooks-manager.ts`. Keys MUST match the
// recordCoverage('macro.flow', ...) calls in the spec.
const MACRO_FLOWS = [
    'create-item-macro',
    'create-skill-macro',
    'create-characteristic-macro',
    'roll-item-macro',
    'roll-skill-macro',
    'roll-characteristic-macro',
];
recordDimension('macro.flow', covered['macro.flow'], MACRO_FLOWS);

// Rules-engine pure-logic flows exercised by tests/e2e/rules-engine.spec.ts.
// Each key maps to a single dynamic-imported entry point on a rules/
// module that no other Tier B spec drives directly. Pushes source-code
// coverage on `src/module/rules/damage-type.ts`, `weapon-jam.ts`,
// `weapon-quality-effects.ts`, `critical-damage.ts`, `config.ts`, and
// the formatter side of `ammo.ts` (actor-bound ammo paths are covered
// by weapon-attack / modifiers). Keys MUST match the
// recordCoverage('rule.flow', ...) calls in the spec.
const RULE_FLOWS = [
    'damage-type-dropdown',
    'damage-type-names',
    'damage-type-array',
    'weapon-jam-floor',
    'weapon-jam-shouldRoll',
    'quality-weaponHasQuality',
    'quality-rollDataHasQuality',
    'quality-getWeaponParryModifier',
    'critical-damage-getFuzzy',
    'critical-damage-loadTable',
    'critical-damage-invalidateCache',
    'config-fieldMatch',
    'config-toggleUIExpanded',
    'ammo-ammoText',
];
recordDimension('rule.flow', covered['rule.flow'], RULE_FLOWS);

// Second batch of pure-logic rules flows exercised by
// tests/e2e/rules-pure-logic.spec.ts. Each key maps to a canonical RAW
// resolver on a rules/ module that no other Tier B spec drives directly
// (the difficulty ladder, scatter, surprise, retry, two-weapon,
// untrained, cover, pinning, fatigue, fear, hit-locations, hazards,
// healing, attack-options helpers). Pushes source-code coverage on
// `src/module/rules/{difficulties,scatter,surprise,trying-again,
// two-weapon-fighting,untrained-skill,cover,pinning,fatigue,fear,
// hit-locations,hazards,healing,attack-options}.ts` — each at 0% Tier B
// function coverage before this spec landed. Keys MUST match the
// recordCoverage('rule-pure.flow', ...) calls in the spec.
const RULE_PURE_FLOWS = [
    'difficulties-rollDifficulties',
    'scatter-buildVector',
    'scatter-scaleForArea',
    'scatter-labelForDirection',
    'surprise-toHitBonus',
    'surprise-canActThisRound',
    'surprise-canUseReactions',
    'trying-again-advice',
    'two-weapon-penalties',
    'untrained-skill-target',
    'cover-resolveHit',
    'cover-startingAP',
    'pinning-resolveTest',
    'pinning-escapeTest',
    'fatigue-threshold',
    'fatigue-unconscious',
    'fatigue-characteristic-halved',
    'fear-testPenalty',
    'fear-resolveTest',
    'fear-shockTableModifier',
    'hit-locations-reverseDigits',
    'hit-locations-forRoll',
    'hit-locations-dropdown',
    'hazards-fallingDice',
    'hazards-fallingFormula',
    'hazards-drowningTest',
    'healing-damageTier',
    'healing-naturalDays',
    'attack-options-availableModes',
    'attack-options-situationalModifiers',
    'attack-options-aimModifier',
];
recordDimension('rule-pure.flow', covered['rule-pure.flow'], RULE_PURE_FLOWS);

// Third batch of pure-logic rules flows exercised by
// tests/e2e/rules-pure-logic-2.spec.ts. Each key maps to a canonical
// affliction / social / vehicle resolver on a rules/ module that no
// other Tier B spec drives directly. Pushes source-code coverage on
// `src/module/rules/{addiction,assistance,characteristic-damage,
// combat-circumstance-modifiers,disposition,disease,poison,hatred,
// phenomena-modifier,reinforcement,requisition-test,spray-avoidance,
// vehicle-actions,vehicle-hazards}.ts` — each at 0% Tier B function
// coverage before this spec landed. Keys MUST match the
// recordCoverage('rule-affliction.flow', ...) calls in the spec.
const RULE_AFFLICTION_FLOWS = [
    'addiction-resolveCheck',
    'addiction-treatmentDays',
    'assistance-bonus',
    'characteristic-damage-atZero',
    'characteristic-damage-effective',
    'characteristic-damage-healed',
    'combat-modifiers-registry',
    'combat-modifiers-sumSelected',
    'disposition-label',
    'disposition-modifier',
    'disease-exposure',
    'disease-dailyTick',
    'poison-exposure',
    'poison-failurePayload',
    'hatred-actorHasHatredFor',
    'phenomena-modifier-compose',
    'reinforcement-callTarget',
    'requisition-test-target',
    'requisition-test-influenceLoss',
    'spray-avoidance-resolve',
    'vehicle-actions-registry',
    'vehicle-hazards-resolveRoll',
    'vehicle-hazards-repairDifficulty',
];
recordDimension('rule-affliction.flow', covered['rule-affliction.flow'], RULE_AFFLICTION_FLOWS);

// Fourth batch of pure-logic rules flows exercised by
// tests/e2e/rules-occult.spec.ts. Each key maps to a canonical occult /
// chaos / progression resolver on a rules/ module that no other Tier B
// spec drives directly. Pushes source-code coverage on
// `src/module/rules/{daemonic-mastery,dark-pact,exorcism,
// malefic-corruption,possession,psychic-push,summoning-ritual,
// xenos-equipment,inquest,malignancy-test,chaos-backgrounds}.ts` —
// each at 0% Tier B function coverage before this spec landed. Keys
// MUST match the recordCoverage('rule-occult.flow', ...) calls in the
// spec.
const RULE_OCCULT_FLOWS = [
    'daemonic-mastery-buildTest',
    'dark-pact-adjustDisposition',
    'dark-pact-discoverySubtletyHit',
    'exorcism-threshold',
    'exorcism-prepareAttempt',
    'exorcism-hostSurvival',
    'malefic-corruption-cost',
    'possession-canUnleash',
    'possession-spendUnleash',
    'possession-resistTarget',
    'psychic-push-resolveMode',
    'summoning-prepareRitual',
    'summoning-bindingDuration',
    'xenos-equipment-condition',
    'xenos-equipment-tickDegradation',
    'inquest-revelationsCrossed',
    'inquest-currentTier',
    'malignancy-thresholdsCrossed',
    'malignancy-testTarget',
    'chaos-backgrounds-predicates',
];
recordDimension('rule-occult.flow', covered['rule-occult.flow'], RULE_OCCULT_FLOWS);

// Fifth batch of pure-logic rules flows exercised by
// tests/e2e/rules-tactical.spec.ts. Each key maps to a side-effect-free
// tactical / registry resolver on a rules/ module that no other Tier B
// spec drives directly. Several of these modules ship NO vitest unit
// test, so they were at 0% on every coverage surface before this spec
// landed. Pushes source-code coverage on
// `src/module/rules/{aim,altitude,attack-specials,explication,
// medicae-mechadendrite,combat-actions,daemon-weapon,daemonhost}.ts`.
// Keys MUST match the recordCoverage('rule-tactical.flow', ...) calls
// in the spec.
const RULE_TACTICAL_FLOWS = [
    'aim-modifiers',
    'aim-calculateBonus',
    'altitude-canChange',
    'altitude-profiles',
    'attack-specials-list',
    'attack-specials-names',
    'explication-breakthroughsCrossed',
    'explication-isComplete',
    'medicae-mechadendrite-data',
    'combat-actions-all',
    'daemon-weapon-profiles',
    'daemonhost-tiers',
];
recordDimension('rule-tactical.flow', covered['rule-tactical.flow'], RULE_TACTICAL_FLOWS);

// ─────────────────────────────────────────────────────────────────────────
// Parallel-subagent expansion batch — ten new Tier B specs, each driving a
// previously-uncovered source area in its own disjoint spec file. For each,
// the *_FLOWS list below MUST stay in sync with the matching constant /
// recordCoverage('<dimension>', ...) keys in the named spec (the spec is the
// source of truth). The storybook story-render spec
// (tests/storybook/extra-story-render.spec.ts) is intentionally absent here —
// it runs under the separate playwright.storybook config, not Tier B.
// ─────────────────────────────────────────────────────────────────────────

// tests/e2e/rolls-builders.spec.ts — src/module/rolls/* pure builders
// (roll-helpers, roll-data, action-data, extended-test-data, damage-data)
// + dice/basic-roll, none driven by rolls-data.spec.ts.
const ROLLS_BUILDER_FLOWS = [
    'helpers-uuid-shape',
    'helpers-get-degree',
    'helpers-opposed-degrees-matrix',
    'helpers-recursive-update-coerce',
    'helpers-handle-dotnotation-delete',
    'roll-data-clamp-modifier-cap',
    'roll-data-constructor-defaults',
    'roll-data-modified-target-getter',
    'roll-data-active-modifiers-getter',
    'roll-data-attack-special-lookup',
    'roll-data-modifiers-to-rolldata',
    'roll-data-calculate-total-modifiers',
    'roll-data-weapon-subclass-template',
    'roll-data-psychic-subclass-template',
    'action-data-constructor',
    'action-data-effect-switch',
    'action-data-weapon-subclass',
    'action-data-psychic-subclass',
    'extended-test-threshold-and-ladder',
    'extended-test-failure-budget',
    'damage-replace-die-with-dos',
    'damage-hit-totals-and-reset',
    'damage-scatter-direction',
    'basic-roll-construct-formula',
];
recordDimension('rolls-builder.flow', covered['rolls-builder.flow'], ROLLS_BUILDER_FLOWS);

// tests/e2e/dice-engine.spec.ts — src/module/dice/* (barrel, BasicRollWH40K,
// D100Roll subclass) deeper than rolls-data.spec.ts / d100-roll-extras.spec.ts.
const DICE_ENGINE_FLOWS = [
    'dice-module-barrel-exports',
    'basic-roll-construct-formula-base',
    'basic-roll-construct-formula-positive-mod',
    'basic-roll-construct-formula-negative-mod',
    'basic-roll-evaluate-static-no-chat',
    'basic-roll-tojson-fromdata-roundtrip',
    'd100-construct-formula-ignores-modifier',
    'd100-target-getter',
    'd100-success-degrees-of-success',
    'd100-failure-degrees-of-failure',
    'd100-degrees-signed-and-absolute',
    'd100-critical-success',
    'd100-critical-failure',
    'd100-doubles-righteous-fury',
    'd100-evaluate-static-no-dialog',
    'd100-get-tooltip-enhances',
];
recordDimension('dice-engine.flow', covered['dice-engine.flow'], DICE_ENGINE_FLOWS);

// tests/e2e/utils-extra.spec.ts — src/module/utils/* not owned by
// calculators.spec.ts / utils-validators.spec.ts (9 distinct modules).
const UTILS_EXTRA_FLOWS = [
    'pack-prefix-dh-editions',
    'pack-prefix-passthrough',
    'encumbrance-carry-capacity',
    'encumbrance-table-exported',
    'origin-ui-characteristic-info',
    'origin-ui-training-label',
    'text-pattern-split-list',
    'text-pattern-to-key',
    'text-pattern-parse-range',
    'text-pattern-parse-value-with-modifier',
    'text-pattern-clean-entry',
    'item-variant-normalize-line-key',
    'item-variant-is-line-container',
    'item-variant-resolve-variant',
    'xp-calculate-total-cost',
    'actor-converter-is-convertible-type',
    'stat-block-validator-validate',
    'origin-chart-layout-compute-full-chart',
];
recordDimension('utils-extra.flow', covered['utils-extra.flow'], UTILS_EXTRA_FLOWS);

// tests/e2e/rules-progression.spec.ts — remaining uncovered src/module/rules/*
// (chaos-talents, elite-advances, radical-services, xenos-features,
// profane-objects, weapon-training, weapon-modifiers, range).
const RULE_PROGRESSION_FLOWS = [
    'chaos-talents-constants',
    'elite-advances-registry',
    'elite-advances-prerequisites',
    'radical-services-registry',
    'radical-services-availability',
    'xenos-features-constants',
    'profane-objects-module-shape',
    'weapon-training-check-noTraining',
    'weapon-training-check-untrained',
    'weapon-training-modifier',
    'weapon-training-description',
    'weapon-modifiers-update',
    'weapon-modifiers-attackBonuses',
    'weapon-modifiers-attackSpecials',
    'range-calculateWeaponRange-melee',
    'range-calculateWeaponRange-noWeapon',
];
recordDimension('rule-progression.flow', covered['rule-progression.flow'], RULE_PROGRESSION_FLOWS);

// tests/e2e/managers-extra.spec.ts — src/module/managers/{event-tracker,
// item-drop-manager,inventory-generator-manager}.ts (managers.spec.ts owns
// grants/transaction).
const MANAGERS_EXTRA_FLOWS = [
    'event-tracker-register-settings',
    'event-tracker-set-and-get-resolved',
    'event-tracker-is-available',
    'event-tracker-blocking-reasons',
    'event-tracker-compute-character-states',
    'event-tracker-build-content-html',
    'event-tracker-open-dialog',
    'item-drop-non-droppable-returns-null',
    'item-drop-no-token-returns-null',
    'item-drop-creates-loot-pile',
    'item-drop-pickup-loot',
    'inventory-generator-collect-candidates',
    'inventory-generator-apply-to-actor',
    'inventory-generator-permission-denied',
];
recordDimension('managers-extra.flow', covered['managers-extra.flow'], MANAGERS_EXTRA_FLOWS);

// tests/e2e/handlebars-helpers-extra.spec.ts — src/module/handlebars/* +
// src/module/helpers/* not driven by helpers.spec.ts.
const HANDLEBARS_EXTRA_FLOWS = [
    'handlebars-number-formatters',
    'handlebars-iteration-helpers',
    'handlebars-logic-helpers',
    'handlebars-collection-helpers',
    'handlebars-string-helpers',
    'handlebars-sanity-ladders',
    'handlebars-weapon-display-helpers',
    'handlebars-talent-trait-helpers',
    'handlebars-option-object-helpers',
    'handlebars-specialQualities',
    'handlebars-standalone-exports',
    'helpers-icon-lookups',
    'helpers-skillkey-rt-family',
    'helpers-skillkey-dh2-family',
    'helpers-craftsmanship',
    'helpers-game-icons',
];
recordDimension('handlebars-extra.flow', covered['handlebars-extra.flow'], HANDLEBARS_EXTRA_FLOWS);

// tests/e2e/data-item-models.spec.ts — src/module/data/item/* derived math
// not asserted by dh-special-items.spec.ts / item-types.spec.ts /
// weapon-attack.spec.ts.
const DATA_ITEM_MODEL_FLOWS = [
    'armour-ap-aggregation',
    'armour-craftsmanship-ap',
    'armour-coverage-derivation',
    'armour-stealth-penalty',
    'gear-weight-math',
    'gear-uses-exhausted',
    'talent-prerequisites',
    'talent-grants-summary',
    'talent-specialization-fullname',
    'ammunition-modifiers',
    'force-field-overload',
    'force-field-craftsmanship',
    'trait-level-variable',
    'skill-derived-labels',
    'condition-duration',
    'weapon-modification-restrictions',
    'psychic-power-pr-cost',
    'ritual-activation-label',
    'special-ability-modifiers',
    'order-test-label',
    'mutation-shape',
];
recordDimension('data-item-model.flow', covered['data-item-model.flow'], DATA_ITEM_MODEL_FLOWS);

// tests/e2e/data-actor-models.spec.ts — src/module/data/actor/templates +
// concrete derived math (creature/character) across all 7 systems.
const DATA_ACTOR_MODEL_FLOWS = [
    'characteristic-total-and-bonus::dh2',
    'characteristic-total-and-bonus::im',
    'characteristic-unnatural-multiplies-bonus::dh2',
    'characteristic-damage-subtracts::dh2',
    'skill-rank-flags::dh2',
    'skill-current-aptitude-untrained::dh2',
    'skill-current-aptitude-untrained::bc',
    'skill-current-aptitude-untrained::ow',
    'skill-current-aptitude-untrained::im',
    'skill-current-career-untrained::rt',
    'skill-current-career-untrained::dh1',
    'skill-current-career-untrained::dw',
    'skill-trained-uses-full-characteristic::dh2',
    'movement-derives-from-ab-and-size::dh2',
    'lifting-and-leap-from-strength-bonus::dh2',
    'fatigue-max-from-toughness-bonus::dh2',
    'psy-current-rating-and-isPsyker::dh2',
    'experience-available-derived::dh2',
    'wounds-fate-resources-roundtrip::dh2',
    'corruption-level-and-insanity-degrees::dh1',
    'subtlety-and-influence-roundtrip::dh2',
    'influence-clamps-to-percentile-ceiling::dh2',
    'roll-data-exposes-characteristic-keys::dh2',
];
recordDimension('data-actor-model.flow', covered['data-actor-model.flow'], DATA_ACTOR_MODEL_FLOWS);

// tests/e2e/applications-tours-extra.spec.ts — src/module/tours/* + uncovered
// src/module/applications/api|components (no overlap with dialogs/sheet-mixins/
// sheet-action-handlers specs).
const APP_TOURS_EXTRA_FLOWS = [
    'tour-wh40k-base-class',
    'tour-main-construct',
    'tour-main-steps-shape',
    'tour-registered-in-game',
    'tooltip-mixin-prepare',
    'dialog-wh40k-static-helpers',
    'dialog-wh40k-instance-render',
    'whatif-mixin-state',
    'statbreakdown-mixin-action',
    'collapsible-panel-mixin-toggle',
    'enhanced-animations-counter',
    'appv2-mixin-number-autoselect',
    'contextmenu-trigger-event',
    'effect-actions-crud',
    'item-target-resolve',
    'active-modifiers-panel-prepare',
    'item-preview-card-toggle',
    'talent-editor-dialog-render',
];
recordDimension('app-tours-extra.flow', covered['app-tours-extra.flow'], APP_TOURS_EXTRA_FLOWS);

// tests/e2e/game-system-configs.spec.ts — src/module/config/game-systems/*.
// 10 single-flow registry/base-helper keys + 7 per-system families × the 7
// canonical GameSystemIds (bc,dh1,dh2,dw,ow,rt,im), `<family>::<id>` shape.
const GAME_SYSTEM_CONFIG_SINGLE_FLOWS = [
    'registry-get-all-systems',
    'registry-getOrNull-and-has',
    'aptitude-cost-tables-dh2',
    'aptitude-resolution-fallback',
    'advance-match-info',
    'career-cost-null-contract',
    'bc-alignment-cost-modifier',
    'skill-level-to-rank',
    'starting-xp-divergence',
    'step-short-labels',
];
const GAME_SYSTEM_CONFIG_FAMILIES = [
    'themeClassFor',
    'config-identity',
    'skill-rank-shape',
    'characteristic-tier-shape',
    'origin-step-config',
    'fate-point-uses',
    'visible-skills',
];
const GAME_SYSTEM_CONFIG_IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'];
const GAME_SYSTEM_CONFIG_FLOWS = [
    ...GAME_SYSTEM_CONFIG_SINGLE_FLOWS,
    ...GAME_SYSTEM_CONFIG_FAMILIES.flatMap((fam) => GAME_SYSTEM_CONFIG_IDS.map((id) => `${fam}::${id}`)),
];
recordDimension('game-system-config.flow', covered['game-system-config.flow'], GAME_SYSTEM_CONFIG_FLOWS);

// ─────────────────────────────────────────────────────────────────────────
// Full-depth + screenshot expansion (round: 12 parallel worktree agents).
// Closes the 7 thin sub-areas (documents-extra, data/{abstract,fields,grant,
// shared}, character-creation wizard, sheet-action handlers for item +
// actor sheets, canvas/token-HUD) plus adds full UI screenshot rendering
// for actor sheets, item sheets, dialogs + chat cards. Storybook all-stories
// screenshots run under playwright.storybook (no Tier B dimension).
// ─────────────────────────────────────────────────────────────────────────

// tests/e2e/documents-extra.spec.ts
const DOCUMENTS_EXTRA_FLOWS = [
    'actor-proxy-dispatches-by-type',
    'actor-proxy-falls-back-on-unknown-type',
    'actor-proxy-registered-on-config',
    'item-container-isNestedItem-false-on-owned',
    'item-container-setNested-roundtrip',
    'item-container-createNestedDocuments-appends',
    'item-container-updateNestedDocuments-merges',
    'item-container-deleteNestedDocuments-removes',
    'item-container-convertNestedToItems-builds-collection',
    'item-container-update-injects-id',
    'chat-message-class-registered',
    'chat-message-getters',
    'chat-message-calculateDegrees-real-roll',
    'chat-message-onChatCardAction-routes',
    'chat-message-enrichActionButtons-stamps-messageId',
    'module-exports-match-config-documentClass',
];
recordDimension('documents-extra.flow', covered['documents-extra.flow'], DOCUMENTS_EXTRA_FLOWS);

// tests/e2e/data-abstract-fields.spec.ts
const DATA_ABSTRACT_FIELDS_FLOWS = [
    'system-data-model-metadata-default',
    'system-data-model-mergeSchema',
    'system-data-model-migrateData-empty',
    'system-data-model-cleanData-empty',
    'system-data-model-mixin-both-branches',
    'system-data-model-initializationOrder-generator',
    'item-data-model-metadata-merged',
    'item-data-model-migrate-description-promotion',
    'item-data-model-migrate-source-promotion',
    'item-data-model-migrate-coverage-array-to-set',
    'item-data-model-migrate-img-default-icon',
    'actor-data-model-metadata-supportsAdvancement',
    'actor-data-model-migrate-noop',
    'formula-field-defaults-deterministic',
    'formula-field-validateType-branches',
    'identifier-field-defaults-blank',
    'identifier-field-validateType-branches',
    'identifier-field-fromName-kebab',
];
recordDimension('data-abstract-fields.flow', covered['data-abstract-fields.flow'], DATA_ABSTRACT_FIELDS_FLOWS);

// tests/e2e/data-grants-extra.spec.ts
const DATA_GRANTS_EXTRA_FLOWS = [
    'base-grant-null-actor-rejects',
    'item-grant-apply-creates-item',
    'item-grant-reverse-removes-item',
    'item-grant-duplicate-name-skipped',
    'item-grant-validate-and-summary',
    'skill-grant-apply-writes-advance',
    'skill-grant-reverse-restores-previous',
    'skill-grant-schema-key-normalisation',
    'characteristic-grant-apply-advance-delta',
    'characteristic-grant-reverse-restores-advance',
    'characteristic-grant-rejects-invalid-key',
    'resource-grant-apply-flat-wounds-bonus',
    'resource-grant-reverse-rolls-back',
    'resource-grant-auto-value-rejects-dice',
    'choice-grant-apply-non-empty-selection',
    'choice-grant-reverse-round-trip',
    'choice-grant-auto-value-always-false',
];
recordDimension('data-grants-extra.flow', covered['data-grants-extra.flow'], DATA_GRANTS_EXTRA_FLOWS);

// tests/e2e/data-shared-templates.spec.ts
const DATA_SHARED_FLOWS = [
    'module-barrel-exports',
    'activation-schema-roundtrip',
    'activation-derived-labels',
    'activation-uses-helpers',
    'attack-schema-roundtrip',
    'attack-derived-getters',
    'body-locations-helpers',
    'damage-schema-roundtrip',
    'damage-derived-labels',
    'description-schema-roundtrip',
    'description-source-reference',
    'equippable-schema-roundtrip',
    'origin-steps-labels',
    'physical-schema-roundtrip',
    'physical-derived-labels',
    'stat-fields-builders',
];
recordDimension('data-shared.flow', covered['data-shared.flow'], DATA_SHARED_FLOWS);

// tests/e2e/character-creation-wizard.spec.ts
const CHARGEN_WIZARD_FLOWS = [
    'system-builders-actor-type-dispatch',
    'system-builders-dh2-stamps-game-system',
    'system-builders-rt-six-core-steps',
    'system-builders-im-falls-back-to-dh2',
    'normalize-origin-from-raw-compendium-doc',
    'normalize-choice-handles-string-options',
    'builder-randomize-fills-selections',
    'builder-set-mode-toggles-guided',
    'builder-clear-origin-removes-selection',
    'builder-go-to-characteristics-step',
    'builder-roll-characteristics-bank-populates',
    'builder-char-reset-clears-assignments',
    'builder-char-toggle-advanced-flips',
    'builder-set-char-gen-mode-changes-state',
    'builder-go-to-equipment-step',
    'builder-clear-equipment-empties-map',
    'builder-toggle-equipment-by-uuid',
    'builder-export-emits-json-blob',
];
recordDimension('chargen-wizard.flow', covered['chargen-wizard.flow'], CHARGEN_WIZARD_FLOWS);

// tests/e2e/sheet-action-handlers-item.spec.ts
const SHEET_ACTION_ITEM_FLOWS = [
    'weapon-sheet::rollAttack',
    'weapon-sheet::rollDamage',
    'weapon-sheet::expendAmmo',
    'weapon-sheet::loadAmmo',
    'weapon-sheet::toggleFab',
    'weapon-sheet::onAddModification',
    'armour-sheet::toggleCoverage',
    'armour-sheet::addProperty',
    'armour-sheet::removeProperty',
    'armour-sheet::addModification',
    'armour-sheet::removeMod',
    'armour-mod-sheet::toggleArmourType',
    'armour-mod-sheet::adjustModifier',
    'armour-mod-sheet::addProperty',
    'armour-mod-sheet::removeProperty',
    'ammo-sheet::addQuality',
    'ammo-sheet::removeAddedQuality',
    'ammo-sheet::removeRemovedQuality',
    'talent-sheet::rollTalent',
    'talent-sheet::postToChat',
    'talent-sheet::adjustRank',
    'talent-sheet::switchTab',
    'gear-sheet::resetUses',
    'gear-sheet::consumeUse',
    'container-item-sheet::nestedItemCreate',
    'container-item-sheet::nestedItemRoll',
    'endeavour-sheet::addObjective',
    'endeavour-sheet::removeObjective',
    'npc-template-sheet::addSkill',
    'npc-template-sheet::removeSkill',
    'npc-template-sheet::addTrait',
    'npc-template-sheet::updatePreview',
];
recordDimension('sheet-action-item.flow', covered['sheet-action-item.flow'], SHEET_ACTION_ITEM_FLOWS);

// tests/e2e/sheet-action-handlers-actor.spec.ts
const SHEET_ACTION_ACTOR_FLOWS = [
    'character-sheet::toggleEquip',
    'character-sheet::stowItem',
    'character-sheet::unstowItem',
    'character-sheet::filterEquipment',
    'character-sheet::toggleFavoriteSkill',
    'character-sheet::toggleFavoriteTalent',
    'character-sheet::adjustSubtletyManually',
    'npc-sheet::toggleHordeMode',
    'npc-sheet::applyMagnitudeDamage',
    'npc-sheet::setSkillLevel',
    'npc-sheet::addTag',
    'npc-sheet::removeTag',
    'npc-sheet::adjustInteractionCount',
    'npc-sheet::scaleToThreat-im',
    'vehicle-sheet::adjustStructure',
    'vehicle-sheet::repairDamage',
    'vehicle-sheet::modifyCrew',
    'vehicle-sheet::adjustCrewMorale',
    'starship-sheet::raiseVoidShield',
    'starship-sheet::lowerVoidShield',
    'starship-sheet::restoreVoidShields',
    'starship-sheet::validateBuild',
    'loot-sheet::pickupAll',
];
recordDimension('sheet-action-actor.flow', covered['sheet-action-actor.flow'], SHEET_ACTION_ACTOR_FLOWS);

// tests/e2e/canvas-token-hud-extra.spec.ts
const CANVAS_EXTRA_FLOWS = [
    'ruler-instantiates-with-token',
    'ruler-waypoint-style-budget-green',
    'ruler-waypoint-style-double-yellow',
    'ruler-waypoint-style-triple-red',
    'ruler-segment-style-respects-speed',
    'ruler-grid-highlight-style',
    'ruler-teleport-action-skips-color',
    'ruler-no-movement-returns-default',
    'token-hud-active-button-class',
    'token-hud-no-movement-skips-injection',
    'token-hud-button-localizes-label',
    'token-hud-set-movement-action-flag-update',
    'token-hud-button-mouseenter-mouseleave-styles',
    'register-movement-actions-config-population',
];
recordDimension('canvas-extra.flow', covered['canvas-extra.flow'], CANVAS_EXTRA_FLOWS);

// tests/e2e/applications-api-components-depth.spec.ts
const APP_API_DEPTH_FLOWS = [
    'drag-drop-api-allowed-behaviors',
    'drag-drop-api-default-behavior',
    'drag-drop-api-modifier-keys',
    'drag-drop-visual-ghost-and-split',
    'drag-drop-visual-validate-slot',
    'drag-drop-visual-favorites-api',
    'expandable-tooltip-toggle-action',
    'expandable-tooltip-programmatic-api',
    'visual-feedback-find-and-classify',
    'visual-feedback-animate-counter',
    'visual-feedback-visualize-changes',
    'wh40k-tooltip-builders',
    'wh40k-tooltip-static-data-helpers',
    'icons-helper-resolution',
    'icons-handlebars-registration',
    'appv2-mixin-subtitle-and-disable',
    'dialog-wait-and-resolve',
    'whatif-mixin-exit-and-direct-apply',
    'statbreakdown-mixin-variant-rows',
    'collapsible-panel-roundtrip',
    'collapsible-panel-apply-preset',
    'enhanced-animations-skip-and-flash',
];
recordDimension('app-api-depth.flow', covered['app-api-depth.flow'], APP_API_DEPTH_FLOWS);

// ── Screenshot dimensions ── outputs go to tests/e2e/screenshots/ (gitignored).

// tests/e2e/screenshots-actor-sheets.spec.ts — every (actorType × systemId × {view,edit}).
const SCREENSHOT_ACTOR_FLOWS = [
    'bc-character::bc::view',
    'bc-character::bc::edit',
    'bc-npc::bc::view',
    'bc-npc::bc::edit',
    'bc-vehicle::bc::view',
    'bc-vehicle::bc::edit',
    'loot::bc::view',
    'loot::bc::edit',
    'dh1-character::dh1::view',
    'dh1-character::dh1::edit',
    'dh1-npc::dh1::view',
    'dh1-npc::dh1::edit',
    'dh1-vehicle::dh1::view',
    'dh1-vehicle::dh1::edit',
    'loot::dh1::view',
    'loot::dh1::edit',
    'dh2-character::dh2::view',
    'dh2-character::dh2::edit',
    'dh2-npc::dh2::view',
    'dh2-npc::dh2::edit',
    'dh2-vehicle::dh2::view',
    'dh2-vehicle::dh2::edit',
    'loot::dh2::view',
    'loot::dh2::edit',
    'dw-character::dw::view',
    'dw-character::dw::edit',
    'dw-npc::dw::view',
    'dw-npc::dw::edit',
    'dw-vehicle::dw::view',
    'dw-vehicle::dw::edit',
    'loot::dw::view',
    'loot::dw::edit',
    'ow-character::ow::view',
    'ow-character::ow::edit',
    'ow-npc::ow::view',
    'ow-npc::ow::edit',
    'ow-vehicle::ow::view',
    'ow-vehicle::ow::edit',
    'loot::ow::view',
    'loot::ow::edit',
    'rt-character::rt::view',
    'rt-character::rt::edit',
    'rt-npc::rt::view',
    'rt-npc::rt::edit',
    'rt-vehicle::rt::view',
    'rt-vehicle::rt::edit',
    'rt-starship::rt::view',
    'rt-starship::rt::edit',
    'loot::rt::view',
    'loot::rt::edit',
    'im-character::im::view',
    'im-character::im::edit',
    'im-npc::im::view',
    'im-npc::im::edit',
    'im-vehicle::im::view',
    'im-vehicle::im::edit',
    'loot::im::view',
    'loot::im::edit',
];
recordDimension('screenshot.actor.flow', covered['screenshot.actor.flow'], SCREENSHOT_ACTOR_FLOWS);

// tests/e2e/screenshots-item-sheets.spec.ts — every itemType × {view,edit}; weapon/armour add ::im::view.
const SCREENSHOT_ITEM_FLOWS = [
    'weapon::view',
    'weapon::edit',
    'weapon::im::view',
    'armour::view',
    'armour::edit',
    'armour::im::view',
    'ammunition::view',
    'ammunition::edit',
    'gear::view',
    'gear::edit',
    'cybernetic::view',
    'cybernetic::edit',
    'forceField::view',
    'forceField::edit',
    'backpack::view',
    'backpack::edit',
    'storageLocation::view',
    'storageLocation::edit',
    'talent::view',
    'talent::edit',
    'trait::view',
    'trait::edit',
    'skill::view',
    'skill::edit',
    'originPath::view',
    'originPath::edit',
    'aptitude::view',
    'aptitude::edit',
    'peer::view',
    'peer::edit',
    'enemy::view',
    'enemy::edit',
    'condition::view',
    'condition::edit',
    'psychicPower::view',
    'psychicPower::edit',
    'navigatorPower::view',
    'navigatorPower::edit',
    'ritual::view',
    'ritual::edit',
    'shipComponent::view',
    'shipComponent::edit',
    'shipWeapon::view',
    'shipWeapon::edit',
    'shipUpgrade::view',
    'shipUpgrade::edit',
    'shipRole::view',
    'shipRole::edit',
    'order::view',
    'order::edit',
    'vehicleTrait::view',
    'vehicleTrait::edit',
    'vehicleUpgrade::view',
    'vehicleUpgrade::edit',
    'weaponModification::view',
    'weaponModification::edit',
    'armourModification::view',
    'armourModification::edit',
    'weaponQuality::view',
    'weaponQuality::edit',
    'attackSpecial::view',
    'attackSpecial::edit',
    'specialAbility::view',
    'specialAbility::edit',
    'criticalInjury::view',
    'criticalInjury::edit',
    'mutation::view',
    'mutation::edit',
    'malignancy::view',
    'malignancy::edit',
    'mentalDisorder::view',
    'mentalDisorder::edit',
    'journalEntry::view',
    'journalEntry::edit',
    'endeavour::view',
    'endeavour::edit',
    'lead::view',
    'lead::edit',
    'npcTemplate::view',
    'npcTemplate::edit',
];
recordDimension('screenshot.item.flow', covered['screenshot.item.flow'], SCREENSHOT_ITEM_FLOWS);

// tests/e2e/screenshots-dialogs-chat.spec.ts — union of dialog classes + chat templates.
const SCREENSHOT_DIALOG_CLASSES = [
    'AcquisitionDialog',
    'AdvancementDialog',
    'AmmoPickerDialog',
    'CharacteristicSetupDialog',
    'ConfirmationDialog',
    'ConvertActorSystemDialog',
    'WH40KCreateActorDialog',
    'FateUsesDialog',
    'RollConfigurationDialog',
    'TransactionRequestDialog',
    'AddXPDialog',
    'AssignDamageDialog',
    'BaseRollDialog',
    'DamageRollDialog',
    'EffectCreationDialog',
    'EnhancedSkillDialog',
    'ForceFieldDialog',
    'PsychicPowerDialog',
    'RighteousFuryDialog',
    'SimpleRollDialog',
    'SpecialistSkillDialog',
    'UnifiedRollDialog',
    'WeaponAttackDialog',
];
const SCREENSHOT_CHAT_TEMPLATES = [
    'acquisition-test',
    'action-roll-chat',
    'armour-card-chat',
    'assign-damage-chat',
    'bleeding-chat',
    'burning-chat',
    'combat-action-card',
    'condition-card',
    'critical-injury-card',
    'damage-roll-chat',
    'force-field-roll-chat',
    'item-card-chat',
    'item-vocalize-chat',
    'movement-card',
    'navigator-power-chat',
    'order-roll-chat',
    'origin-roll-card',
    'psychic-action-chat',
    'reload-action-chat',
    'ritual-roll-chat',
    'ship-weapon-chat',
    'simple-roll-chat',
    'skill-card',
    'talent-card',
    'talent-roll-chat',
    'trait-card',
    'weapon-card-chat',
];
const SCREENSHOT_DIALOG_CHAT_FLOWS = [...SCREENSHOT_DIALOG_CLASSES.map((c) => `dialog::${c}`), ...SCREENSHOT_CHAT_TEMPLATES.map((t) => `chat::${t}`)];
recordDimension('screenshot.dialog-chat.flow', covered['screenshot.dialog-chat.flow'], SCREENSHOT_DIALOG_CHAT_FLOWS);

// ─────────────────────────────────────────────────────────────────────────
// Gap-closure wave (round: 5 parallel worktree agents). Targets the
// remaining structural gaps: compendium pack content validation, Foundry
// CONFIG registration audit, form-submit round-trip across many sheets,
// hook-handler observable side-effects. (The Storybook visual-regression
// spec uses Playwright's toHaveScreenshot baselines — no Tier B dim.)
// ─────────────────────────────────────────────────────────────────────────

// tests/e2e/foundry-config-audit.spec.ts
const FOUNDRY_CONFIG_FLOWS = [
    'config::Actor.documentClass',
    'config::Actor.documentClasses-map',
    'config::Item.documentClass',
    'config::ActiveEffect.documentClass',
    'config::ChatMessage.documentClass',
    'config::Token.documentClass',
    'config::Token.rulerClass',
    'config::Token.movement.costAggregator',
    'config::Combat.initiative.formula',
    'config::MeasuredTemplate.defaults.angle',
    'config::Dice.rolls.BasicRollWH40K',
    'config::Dice.rolls.D100Roll',
    'config::wh40k.config-installed',
    'config::Actor.dataModels.bc-all',
    'config::Actor.dataModels.dh1-all',
    'config::Actor.dataModels.dh2-all',
    'config::Actor.dataModels.rt-all',
    'config::Actor.dataModels.ow-all',
    'config::Actor.dataModels.dw-all',
    'config::Actor.dataModels.im-all',
    'config::Actor.dataModels.loot',
    'config::Item.dataModels.equipment',
    'config::Item.dataModels.features',
    'config::Item.dataModels.powers',
    'config::Item.dataModels.ship-vehicle',
    'config::Item.dataModels.modifications',
    'config::Item.dataModels.misc',
    'config::Actor.sheetClasses.bc-all',
    'config::Actor.sheetClasses.dh1-all',
    'config::Actor.sheetClasses.dh2-all',
    'config::Actor.sheetClasses.rt-all',
    'config::Actor.sheetClasses.ow-all',
    'config::Actor.sheetClasses.dw-all',
    'config::Actor.sheetClasses.im-all',
    'config::Actor.sheetClasses.loot',
    'config::Actor.sheetClasses.no-anonymous-collisions',
    'config::Item.sheetClasses.populated',
    'config::Item.sheetClasses.no-anonymous-collisions',
    'config::TextEditor.enrichers.populated',
    'config::statusEffects.populated',
    'config::game.wh40k.namespace',
    'config::game.wh40k.log',
    'config::game.wh40k.warn',
    'config::game.wh40k.error',
    'config::game.wh40k.rollItemMacro',
    'config::game.wh40k.rollSkillMacro',
    'config::game.wh40k.rollCharacteristicMacro',
    'config::game.wh40k.rollTable',
    'config::game.wh40k.openCompendiumBrowser',
    'config::game.wh40k.OriginPathBuilder',
    'config::game.wh40k.openOriginPathBuilder',
    'config::game.wh40k.npc',
    'config::game.wh40k.transaction',
    'config::game.wh40k.dice',
    'config::game.wh40k.BasicRollWH40K',
    'config::game.wh40k.D100Roll',
];
recordDimension('foundry-config.flow', covered['foundry-config.flow'], FOUNDRY_CONFIG_FLOWS);

// tests/e2e/compendium-content-validation.spec.ts
const COMPENDIUM_CONTENT_FLOWS = [
    'bc-core-items-talents::validated',
    'bc-core-items-weapons::validated',
    'bc-core-archetypes::validated',
    'dh1-core-items-talents::validated',
    'dh1-core-items-weapons::validated',
    'dh2-core-stats-talents::validated',
    'dh2-core-items-weapons::validated',
    'dh2-core-stats-skills::validated',
    'dh2-core-stats-conditions::validated',
    'dh2-core-stats-traits::validated',
    'dh2-core-stats-homeworlds::validated',
    'dh2-actors-bestiary::validated',
    'dh2-core-rolltables::validated',
    'dh2-core-journals::validated',
    'dw-core-items-talents::validated',
    'dw-core-items-weapons::validated',
    'dw-core-chapters::validated',
    'hb-items-weapons::validated',
    'hb-items-actors::validated',
    'ow-core-items-talents::validated',
    'ow-core-items-weapons::validated',
    'ow-core-homeworlds::validated',
    'rt-core-items-talents::validated',
    'rt-core-items-weapons::validated',
    'rt-core-actors-ships::validated',
    'rt-core-items-traits::validated',
];
recordDimension('compendium-content.flow', covered['compendium-content.flow'], COMPENDIUM_CONTENT_FLOWS);

// tests/e2e/sheet-form-submit-extra.spec.ts
const SHEET_FORM_SUBMIT_EXTRA_FLOWS = [
    'character-dh2-sheet::system.wounds.max',
    'character-dh2-sheet::system.insanity',
    'character-dh2-sheet::system.corruption',
    'character-dh2-sheet::system.requisition',
    'character-dh2-sheet::system.throneGelt',
    'character-dh2-sheet::system.experience.total',
    'character-dh2-sheet::system.bio.age',
    'character-dh2-sheet::system.bio.eyes',
    'character-rt-sheet::system.wounds.value',
    'character-rt-sheet::system.bio.age',
    'character-rt-sheet::system.rogueTrader.profitFactor.current',
    'character-rt-sheet::system.throneGelt',
    'character-bc-sheet::system.wounds.value',
    'character-bc-sheet::system.insanity',
    'character-bc-sheet::system.corruption',
    'character-bc-sheet::system.bio.gender',
    'npc-dh2-sheet::system.wounds.value',
    'npc-dh2-sheet::system.wounds.max',
    'npc-dh2-sheet::system.armour.total',
    'npc-dh2-sheet::system.armour.locations.body',
    'npc-dh2-sheet::system.faction',
    'npc-dh2-sheet::system.threatLevel',
    'vehicle-dh2-sheet::system.integrity.value',
    'vehicle-dh2-sheet::system.integrity.max',
    'vehicle-dh2-sheet::system.armour.front.value',
    'vehicle-dh2-sheet::system.speed.cruising',
    'vehicle-dh2-sheet::system.crew.required',
    'starship-rt-sheet::system.hullIntegrity.value',
    'starship-rt-sheet::system.hullIntegrity.max',
    'starship-rt-sheet::system.speed',
    'starship-rt-sheet::system.armour',
    'starship-rt-sheet::system.voidShields',
    'starship-rt-sheet::system.crew.population',
    'weapon-sheet::system.damage.bonus',
    'weapon-sheet::system.damage.penetration',
    'weapon-sheet::system.clip.value',
    'weapon-sheet::system.clip.max',
    'weapon-sheet::system.attack.modifier',
    'weapon-sheet::system.attack.range.value',
    'weapon-sheet::system.attack.rateOfFire.semi',
    'armour-sheet::system.armourPoints.head',
    'armour-sheet::system.armourPoints.body',
    'armour-sheet::system.armourPoints.leftArm',
    'armour-sheet::system.armourPoints.leftLeg',
    'armour-sheet::system.primitive',
    'talent-sheet::system.tier',
    'talent-sheet::system.cost',
    'talent-sheet::system.rank',
    'talent-sheet::system.isPassive',
    'gear-sheet::system.quantity',
    'gear-sheet::system.uses.value',
    'gear-sheet::system.uses.max',
    'gear-sheet::system.consumable',
];
recordDimension('sheet-form-submit-extra.flow', covered['sheet-form-submit-extra.flow'], SHEET_FORM_SUBMIT_EXTRA_FLOWS);

// tests/e2e/hook-handler-effects.spec.ts
const HOOK_HANDLER_EFFECT_FLOWS = [
    'hook-effect::init::config-actor-document',
    'hook-effect::ready::game-wh40k-namespace',
    'hook-effect::renderChatMessageHTML::wh40k-ancestor',
    'hook-effect::updateActor::derived-data-recomputed',
    'hook-effect::updateItem::derived-modifiers-applied',
    'hook-effect::combatStart::condition-applied',
    'hook-effect::combatTurn::on-turn-effects-resolved',
    'hook-effect::combatRound::bleed-tick',
    'hook-effect::deleteCombat::cleanup-flag-cleared',
    'hook-effect::getSceneControlButtons::assignDamage-tool',
    'hook-effect::getActorSheetClass::default-fallthrough',
    'hook-effect::hotbarDrop::item-shortcircuit',
    'hook-effect::getActorDirectoryEntryContext::convert-system-entry',
    'hook-effect::createItem::uuid-cache-warm',
    'hook-effect::deleteItem::uuid-cache-evicts',
    'hook-effect::registration::all-hooks-installed',
];
recordDimension('hook-handler-effect.flow', covered['hook-handler-effect.flow'], HOOK_HANDLER_EFFECT_FLOWS);

// Roll-data plumbing flows exercised by tests/e2e/rolls-data.spec.ts. Drives
// source-code coverage on `src/module/rolls/assign-damage-data.ts` (the
// damage allocator's reduce-then-distribute branch matrix between wounds,
// criticals, and fatigue), `src/module/rolls/force-field-data.ts` (every
// `craftsmanshipToOverload` case + `finalize` roll+threshold path), and
// the canonical `src/module/dice/d100-roll.ts` entry point. Keys MUST
// match the recordCoverage('roll-data.flow', ...) calls in the spec.
const ROLL_DATA_FLOWS = [
    'assign-damage-constructor',
    'assign-damage-update-armour-resolved',
    'assign-damage-finalize-reduces-wounds',
    'assign-damage-finalize-empty-wounds-criticals',
    'assign-damage-finalize-fatigue',
    'force-field-constructor',
    'force-field-craftsmanship-overload',
    'force-field-finalize',
    'd100-roll-test',
];
recordDimension('roll-data.flow', covered['roll-data.flow'], ROLL_DATA_FLOWS);

// Character-creation dialog render flows exercised by
// tests/e2e/character-creation-dialogs.spec.ts. Drives source-code
// coverage on the three per-step dialogs that origin-path-builder.spec.ts
// never opens (it drives only the outer builder shell):
// `src/module/applications/character-creation/origin-roll-dialog.ts`,
// `origin-path-choice-dialog.ts`, `origin-detail-dialog.ts`. Each was
// below 10% function coverage before this spec landed.
const CHARGEN_FLOWS = ['origin-roll-dialog-renders', 'origin-path-choice-dialog-renders', 'origin-detail-dialog-renders'];
recordDimension('chargen.flow', covered['chargen.flow'], CHARGEN_FLOWS);

// NPC-creation dialog render flows exercised by tests/e2e/npc-creation.spec.ts.
// Drives source-code coverage on the three creation dialogs that
// npc-tools.spec.ts never opens (it targets the parser / exporter /
// scaler / encounter-builder):
// `src/module/applications/npc/quick-create-dialog.ts`,
// `batch-create-dialog.ts`, `template-selector.ts`. Each was below
// 10% function coverage before this spec landed.
const NPC_CREATE_FLOWS = ['quick-create-dialog-renders', 'batch-create-dialog-renders', 'template-selector-renders'];
recordDimension('npc-create.flow', covered['npc-create.flow'], NPC_CREATE_FLOWS);

// Canvas/ruler module-shape flows exercised by tests/e2e/canvas-ruler.spec.ts.
// Drives source-code coverage on `src/module/canvas/ruler.ts` (0% / 50.7%).
// The TokenRulerWH40K override is a canvas-bound class — its method
// overrides require a real PIXI WebGL context. The spec confirms the
// module imports cleanly under a PIXI stub and the class extends
// `foundry.canvas.placeables.tokens.TokenRuler`. Full method-level
// coverage of `_getWaypointStyle` / `_getSegmentStyle` /
// `_getGridHighlightStyle` requires either a placed-token canvas
// scenario (out of scope here) or a future GL-mock layer.
const CANVAS_FLOWS = ['ruler-module-imports', 'ruler-class-extends-token-ruler'];
recordDimension('canvas.flow', covered['canvas.flow'], CANVAS_FLOWS);

// Active-effects rule helpers exercised by tests/e2e/active-effects-rules.spec.ts.
// Drives source-code coverage on `src/module/rules/active-effects.ts` (was
// 0% fn / 34.7% line). active-effects.spec.ts covers Foundry's native
// ActiveEffect application modes (add/multiply/override/etc.); this
// dimension covers the WH40K-side factory + lifecycle helpers that
// author effects from a higher-level intent (e.g. "characteristic +10
// for 3 rounds", "create stunned condition"). Keys MUST match the
// recordCoverage('active-effects-rule.flow', ...) calls in the spec.
const ACTIVE_EFFECTS_RULES_FLOWS = [
    'createEffect',
    'createCharacteristicEffect',
    'createSkillEffect',
    'createCombatEffect',
    'createConditionEffect',
    'createTemporaryEffect',
    'removeEffectByName',
    'removeEffects',
    'toggleEffect',
    'handleBleeding',
    'handleBloodLoss',
    'handleOnFire',
    'sendActiveEffectMessage',
];
recordDimension('active-effects-rule.flow', covered['active-effects-rule.flow'], ACTIVE_EFFECTS_RULES_FLOWS);

// Sheet action-handler flows exercised by tests/e2e/sheet-action-handlers.spec.ts.
// Drives source-code coverage on two UI-adjacent modules that no other
// spec exercises directly:
//   - applications/components/quick-actions-bar.ts (was 0% / 21.7%) —
//     `QuickActionsBar.getActionsForItem` per-item-type factory.
//   - applications/api/stat-adjustment-actions.ts (was 0% / 32.4%) —
//     the (this: Host, event, target) sheet-action handlers wired into
//     character/NPC sheets for incrementing/decrementing characteristics,
//     setting critical pips / fate stars / fatigue bolts / corruption /
//     insanity, restoring + spending fate.
// Keys MUST match the recordCoverage('sheet-action.flow', ...) calls
// in the spec.
const SHEET_ACTION_FLOWS = [
    'quick-actions-weapon',
    'quick-actions-armour',
    'quick-actions-talent',
    'quick-actions-gear',
    'stat-adjustStat',
    'stat-increment',
    'stat-decrement',
    'stat-setCriticalPip',
    'stat-setFateStar',
    'stat-setFatigueBolt',
    'stat-setCorruption',
    'stat-setInsanity',
    'stat-restoreFate',
    'stat-spendFate',
];
recordDimension('sheet-action.flow', covered['sheet-action.flow'], SHEET_ACTION_FLOWS);

// utils/prerequisite-validator + utils/roll-table-utils flows exercised
// by tests/e2e/utils-validators.spec.ts. Drives source-code coverage on
// `src/module/utils/prerequisite-validator.ts` (0% / 39.2% pre-spec) and
// `src/module/utils/roll-table-utils.ts` (0% / 45.2% pre-spec). The
// roll-table-* domain wrappers tolerate a null return when the named
// roll table isn't packed in the test world — coverage attribution
// happens via the call, not the outcome. Keys MUST match the
// recordCoverage('utils-validators.flow', ...) calls in the spec.
const UTILS_VALIDATORS_FLOWS = [
    'prereq-parse-characteristic',
    'prereq-parse-skill',
    'prereq-parse-empty',
    'prereq-check-empty',
    'prereq-check-unmet-characteristic',
    'prereq-check-unmet-skill',
    'roll-table-findInCompendiums',
    'roll-table-rollPsychicPhenomena',
    'roll-table-rollPerilsOfTheWarp',
    'roll-table-rollMutation',
    'roll-table-rollMalignancy',
    'roll-table-rollNavigatorMutation',
    'roll-table-rollGiftOfTheGods',
    'roll-table-rollFearEffects',
    'roll-table-rollCriticalInjury',
];
recordDimension('utils-validators.flow', covered['utils-validators.flow'], UTILS_VALIDATORS_FLOWS);

// Data-layer flows exercised by tests/e2e/data-layer.spec.ts. Drives
// source-code coverage on three uncovered data modules:
//   - data/fields/mapping-field.ts (was 0% / 38.8%) — construct,
//     getInitialValue, _cleanType.
//   - config/advancements/index.ts (was 0% / 60.8%) — all 7 pure
//     career-registry getters.
//   - data/grant/choice-grant.ts (was 11.1% / 32.6%) and
//     data/grant/resource-grant.ts (was 11.1% / 35.2%) — the
//     `_applyGrant` paths driven synthetically against a seeded actor.
// Keys MUST match the recordCoverage('data-layer.flow', ...) calls
// in the spec.
const DATA_LAYER_FLOWS = [
    'mapping-field-construct',
    'mapping-field-getInitialValue',
    'mapping-field-cleanType',
    'advancements-getAvailableCareers',
    'advancements-getCareerKeyFromName',
    'advancements-hasCareer',
    'advancements-getCareerAdvancements',
    'advancements-getCharacteristicCosts',
    'advancements-getRankAdvancements',
    'advancements-getNextCharacteristicCost',
    'choice-grant-applyEmpty',
    'choice-grant-applyDuplicateRejected',
    'resource-grant-applyEmpty',
];
recordDimension('data-layer.flow', covered['data-layer.flow'], DATA_LAYER_FLOWS);

// Loot drop/pickup feature dimension exercised by tests/e2e/loot.spec.ts.
// Keys MUST match the recordCoverage('loot.flow', ...) calls in that spec.
// Canvas/HUD placement is a runtime-render concern; the document-layer
// transfer + DataModel + sheet render are fully driveable headlessly.
const LOOT_FLOWS = [
    'loot-actor-type-registered',
    'loot-datamodel-prepares',
    'loot-pile-reports-contents',
    'manager-pure-helpers',
    'loot-sheet-renders',
    'pickup-transfers-items',
    'drop-non-droppable-rejected',
];
recordDimension('loot.flow', covered['loot.flow'], LOOT_FLOWS);

// WH40KStarship document-layer methods exercised by
// tests/e2e/starship-methods.spec.ts. vehicle-starship.spec.ts drives the
// underlying DataModel (component embedding, morale, hull-and-shields);
// this dimension covers the Document class itself — every getter on
// `src/module/documents/starship.ts` plus `prepareData`, `fireWeapon`
// (valid + invalid weapon-id branches), and the `rollInitiative`
// override. Was 8.3% fn / 55.8% line pre-spec. Keys MUST match the
// recordCoverage('starship-methods.flow', ...) calls in the spec.
const STARSHIP_METHODS_FLOWS = [
    'get-hullType',
    'get-hullClass',
    'get-hullIntegrity',
    'get-speed',
    'get-manoeuvrability',
    'get-detection',
    'get-detectionBonus',
    'get-armour',
    'get-voidShields',
    'get-turretRating',
    'get-crew',
    'get-power',
    'get-space',
    'get-weaponCapacity',
    'get-isCrippled-false',
    'get-isCrippled-true',
    'get-isDestroyed-false',
    'get-isDestroyed-true',
    'get-shipComponents',
    'get-shipWeapons',
    'get-shipUpgrades',
    'get-weaponsByLocation',
    'method-prepareData',
    'method-fireWeapon-valid',
    'method-fireWeapon-invalid',
    'method-rollInitiative',
];
recordDimension('starship-methods.flow', covered['starship-methods.flow'], STARSHIP_METHODS_FLOWS);

const total = passed + failed + skipped + timedOut;
const dimensionWeights = Object.values(dimensions);
const aggregatePercent = dimensionWeights.length ? Math.round((dimensionWeights.reduce((a, d) => a + d.percent, 0) / dimensionWeights.length) * 100) / 100 : 0;

// --- source-code coverage on src/module/**/*.ts (lines/statements/functions/branches) ---
let source = null;
const srcRun = spawnSync(process.execPath, ['scripts/e2e-source-coverage.mjs'], {
    stdio: 'inherit',
});
if (srcRun.status === 0) {
    const summaryPath = '.e2e-source-coverage/coverage-summary.json';
    if (existsSync(summaryPath)) {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
        const t = summary.total ?? {};
        source = {
            lines: t.lines ?? null,
            statements: t.statements ?? null,
            functions: t.functions ?? null,
            branches: t.branches ?? null,
            fileCount: Object.keys(summary).filter((k) => k !== 'total').length,
        };
    }
} else {
    console.warn('e2e-source-coverage produced no report (skipped or errored)');
}

const coverage = {
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    skipped,
    timedOut,
    total,
    perSpec,
    dimensions,
    aggregatePercent,
    source,
};

writeFileSync(OUTPUT, `${JSON.stringify(coverage, null, 2)}\n`);

console.log(`e2e:coverage — ${passed} passed / ${failed} failed / ${skipped} skipped / ${timedOut} timed out — aggregate ${aggregatePercent}%`);
for (const [name, d] of Object.entries(dimensions)) {
    console.log(
        `  ${name}: ${d.covered}/${d.total} (${d.percent}%)${
            d.missing.length ? ` — missing: ${d.missing.slice(0, 5).join(', ')}${d.missing.length > 5 ? `, +${d.missing.length - 5} more` : ''}` : ''
        }`,
    );
}
console.log(`  → ${OUTPUT}`);
