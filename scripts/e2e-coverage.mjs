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
const SUBTLETY_FLOWS = ['subtlety-baseline', 'subtlety-manual-adjustment', 'subtlety-inquest-adjustment', 'talent-subtlety-delta-applies', 'talent-subtlety-requiresEquipped', 'subtlety-minAbsoluteDelta-floors', 'subtlety-clears-when-removed'];

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

if (inventory) {
    // validActorTypeSystemPairs is the per-system-prefixed enumeration —
    // `dh2-character::dh2e` counts, `dh2-character::bc` does not (would never
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
