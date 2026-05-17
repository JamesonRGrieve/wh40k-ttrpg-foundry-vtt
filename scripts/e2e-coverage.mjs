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
                if (status === 'passed') { passed++; perSpec[file].passed++; }
                else if (status === 'failed') { failed++; perSpec[file].failed++; }
                else if (status === 'skipped') { skipped++; perSpec[file].skipped++; }
                else if (status === 'timedOut') { timedOut++; perSpec[file].timedOut++; }
            }
        }
        walk(suite.suites);
    }
}
walk(report.suites);

// --- per-dimension coverage % from inventory + runtime tracker ---
let inventory = null;
if (existsSync(INVENTORY)) {
    try { inventory = JSON.parse(readFileSync(INVENTORY, 'utf8')); }
    catch (err) { console.warn(`e2e:coverage — ignoring malformed ${INVENTORY}: ${err.message}`); }
}

const covered = {}; // { dimension: Set<key> }
if (existsSync(RUNTIME)) {
    const lines = readFileSync(RUNTIME, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
        try {
            const { dimension, key } = JSON.parse(line);
            covered[dimension] ??= new Set();
            covered[dimension].add(key);
        } catch { /* skip bad line */ }
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
const ACTOR_ROLL_METHODS = [
    'rollCharacteristic',
    'rollCharacteristicCheck',
    'rollSkill',
    'rollCheck',
    'rollItem',
    'rollWeaponAction',
    'rollPsychicPower',
];

// Public Item document roll methods exercised by tests/e2e/item-rolls.spec.ts.
// Enumerated explicitly because they live on the Item document subclass, not
// on `CONFIG.Item.*` data models. Adding a new roll method to item.ts means
// adding it here AND in the ITEM_ROLL_SPECS table in the spec.
const ITEM_ROLL_METHODS = [
    'rollTalent',
    'rollNavigatorPower',
    'rollOrder',
    'rollRitual',
];

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

recordDimension('dh2.fate', covered['dh2.fate'], ['fate-track']);
recordDimension('dh2.corruption', covered['dh2.corruption'], ['corruption-track']);
recordDimension('dh2.insanity', covered['dh2.insanity'], ['insanity-track']);
recordDimension('dh2.origin-path', covered['dh2.origin-path'], ['create-and-embed']);
recordDimension('dh2.elite-advance', covered['dh2.elite-advance'], ['compendium-read']);

const total = passed + failed + skipped + timedOut;
const dimensionWeights = Object.values(dimensions);
const aggregatePercent = dimensionWeights.length
    ? Math.round(
          (dimensionWeights.reduce((a, d) => a + d.percent, 0) / dimensionWeights.length) * 100,
      ) / 100
    : 0;

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

console.log(
    `e2e:coverage — ${passed} passed / ${failed} failed / ${skipped} skipped / ${timedOut} timed out — aggregate ${aggregatePercent}%`,
);
for (const [name, d] of Object.entries(dimensions)) {
    console.log(`  ${name}: ${d.covered}/${d.total} (${d.percent}%)${d.missing.length ? ` — missing: ${d.missing.slice(0, 5).join(', ')}${d.missing.length > 5 ? `, +${d.missing.length - 5} more` : ''}` : ''}`);
}
console.log(`  → ${OUTPUT}`);
