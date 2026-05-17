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
}

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
