#!/usr/bin/env node
// Ratchet for Tier B e2e tests. Three gates, all monotonically improving:
//   1. `passed` count cannot fall — protects against test deletion.
//   2. Per-dimension coverage % cannot fall — protects against new
//      surfaces (actor type, item type, sheet) landing without a test
//      that records coverage for them. When a dimension hits 100% it
//      AUTO-FLIPS to strict mode (recorded in `strict[]`): subsequent
//      runs must keep it at 100% and `--update` will NOT silence a
//      drop. Demoting a strict dimension requires manually editing
//      `.e2e-baseline` and explaining why in the commit.
//   3. Source-code coverage % (lines / statements / functions /
//      branches) cannot fall — protects against new code landing
//      without paired e2e specs.
//
// Update via `pnpm e2e:ratchet:update` when a deliberate increase happens.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const COVERAGE = '.e2e-coverage.json';
const BASELINE = '.e2e-baseline';
const UPDATE = process.argv.includes('--update');

if (!existsSync('.e2e-results.json')) {
    console.error('e2e:ratchet — .e2e-results.json missing. Run `pnpm test:e2e` first.');
    process.exit(2);
}

const regen = spawnSync(process.execPath, ['scripts/e2e-coverage.mjs'], { stdio: 'inherit' });
if (regen.status !== 0) process.exit(regen.status ?? 1);

const report = JSON.parse(readFileSync(COVERAGE, 'utf8'));
const currentPassed = Number(report.passed ?? 0);
const currentDimensions = Object.fromEntries(Object.entries(report.dimensions ?? {}).map(([name, d]) => [name, d.percent]));
const currentSource = pickSourceMetrics(report.source);

if (UPDATE || !existsSync(BASELINE)) {
    // Preserve the existing `strict` list and extend it with any dimension
    // that just hit 100% — the auto-flip graduation pattern documented in
    // .foundry-system/CLAUDE.md ("Ratchet inventory").
    let priorStrict = [];
    if (existsSync(BASELINE)) {
        try {
            priorStrict = JSON.parse(readFileSync(BASELINE, 'utf8')).strict ?? [];
        } catch {
            /* fresh write */
        }
    }
    const strict = new Set(priorStrict);
    for (const [name, pct] of Object.entries(currentDimensions)) {
        if (pct >= 100) strict.add(name);
    }
    writeFileSync(
        BASELINE,
        `${JSON.stringify(
            {
                passed: currentPassed,
                strict: [...strict].sort(),
                dimensions: currentDimensions,
                source: currentSource,
            },
            null,
            2,
        )}\n`,
    );
    console.log(`e2e:ratchet — baseline ${UPDATE ? 'updated' : 'seeded'}:`);
    console.log(`  passed: ${currentPassed}`);
    if (strict.size) console.log(`  strict (locked at 100%): ${[...strict].sort().join(', ')}`);
    for (const [name, pct] of Object.entries(currentDimensions)) {
        console.log(`  ${name}: ${pct}%`);
    }
    if (currentSource) {
        for (const [k, v] of Object.entries(currentSource)) {
            console.log(`  source.${k}: ${v}%`);
        }
    }
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baselinePassed = Number(baseline.passed ?? 0);
const baselineDimensions = baseline.dimensions ?? {};
const baselineSource = baseline.source ?? null;
const strictDimensions = new Set(baseline.strict ?? []);

const failures = [];
const strictViolations = [];
if (currentPassed < baselinePassed) {
    failures.push(`passed dropped: ${currentPassed} < baseline ${baselinePassed}`);
}
for (const [name, baselinePct] of Object.entries(baselineDimensions)) {
    const currentPct = currentDimensions[name];
    if (currentPct === undefined) {
        failures.push(`dimension '${name}' disappeared from coverage report`);
        continue;
    }
    if (strictDimensions.has(name) && currentPct < 100) {
        strictViolations.push(`${name} graduated at 100% but is now ${currentPct}% — strict mode does NOT accept --update`);
        continue;
    }
    if (currentPct < baselinePct) {
        failures.push(`${name} coverage dropped: ${currentPct}% < baseline ${baselinePct}%`);
    }
}
if (baselineSource) {
    if (!currentSource) {
        failures.push('source-code coverage disappeared from coverage report');
    } else {
        for (const [k, baselinePct] of Object.entries(baselineSource)) {
            const currentPct = currentSource[k];
            if (currentPct === undefined) {
                failures.push(`source.${k} disappeared from coverage report`);
                continue;
            }
            if (currentPct < baselinePct) {
                failures.push(`source.${k} coverage dropped: ${currentPct}% < baseline ${baselinePct}%`);
            }
        }
    }
}

if (strictViolations.length) {
    console.error('e2e:ratchet STRICT-MODE VIOLATION:');
    for (const v of strictViolations) console.error(`  - ${v}`);
    console.error('  These dimensions previously graduated to 100% and cannot regress.');
    console.error('  Fix the underlying coverage drop. To demote, edit .e2e-baseline manually and explain in the commit.');
    process.exit(1);
}
if (failures.length) {
    console.error('e2e:ratchet failed:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('  Fix the regression, or run `pnpm e2e:ratchet:update` if the drop is intentional.');
    process.exit(1);
}

const gains = [];
if (currentPassed > baselinePassed) {
    gains.push(`passed: ${currentPassed} (was ${baselinePassed})`);
}
for (const [name, baselinePct] of Object.entries(baselineDimensions)) {
    const currentPct = currentDimensions[name];
    if (currentPct > baselinePct) {
        gains.push(`${name}: ${currentPct}% (was ${baselinePct}%)`);
    }
}
if (currentSource && baselineSource) {
    for (const [k, baselinePct] of Object.entries(baselineSource)) {
        const currentPct = currentSource[k];
        if (currentPct > baselinePct) {
            gains.push(`source.${k}: ${currentPct}% (was ${baselinePct}%)`);
        }
    }
}
if (gains.length) {
    console.log('e2e:ratchet — improvements detected (run `pnpm e2e:ratchet:update` to lock in):');
    for (const g of gains) console.log(`  + ${g}`);
}

process.exit(0);

function pickSourceMetrics(source) {
    if (!source) return null;
    const out = {};
    for (const k of ['lines', 'statements', 'functions', 'branches']) {
        const v = source[k];
        if (v && typeof v.pct === 'number') out[k] = v.pct;
    }
    return Object.keys(out).length ? out : null;
}
