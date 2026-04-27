#!/usr/bin/env node
/**
 * Per-rule, per-directory TS-strictness ratchet. Runs scripts/ts-coverage.mjs
 * (silently) and compares the result to .ts-coverage-baseline. Fails when ANY
 * (metric, directory) pair regresses upward. New directories are added at
 * their current count; removed directories are dropped. Update via
 * `pnpm ts:ratchet:update`.
 *
 * This is independent of the existing tsc-error-baseline ratchet — that
 * gates total tsc errors; this gates the four manual-suppression patterns
 * agents are most likely to introduce when fixing types under time pressure.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT = resolve(process.cwd(), '.ts-coverage.json');
const BASELINE = resolve(process.cwd(), '.ts-coverage-baseline');
const METRICS = ['any', 'asAny', 'tsExpectError', 'tsIgnore'];
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

execSync('node scripts/ts-coverage.mjs --quiet', { stdio: 'inherit' });
const cur = JSON.parse(readFileSync(REPORT, 'utf8'));

function pickBaselineShape(report) {
    const out = { totals: {}, byDir: {} };
    for (const m of METRICS) out.totals[m] = report.summary[m];
    for (const d of Object.keys(report.byDir)) {
        out.byDir[d] = {};
        for (const m of METRICS) out.byDir[d][m] = report.byDir[d][m];
    }
    return out;
}

const curBaseline = pickBaselineShape(cur);
const serialized = JSON.stringify(curBaseline, null, 2) + '\n';

if (updateMode) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log('[ts-ratchet] baseline updated. Totals:', curBaseline.totals);
    process.exit(0);
}

if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log('[ts-ratchet] baseline file missing — initialised. Totals:', curBaseline.totals);
    process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

const failures = [];
for (const d of Object.keys(curBaseline.byDir)) {
    if (!base.byDir[d]) continue; // brand-new directory — treat as 0 baseline (i.e. any positive count fails on next commit if it grows from there; for first appearance, allow)
    for (const m of METRICS) {
        const c = curBaseline.byDir[d][m];
        const b = base.byDir[d][m];
        if (c > b) failures.push(`${d}/${m}: ${b} -> ${c} (+${c - b})`);
    }
}

// Brand-new directories: write a warning but allow.
const brandNew = Object.keys(curBaseline.byDir).filter((d) => !base.byDir[d]);

if (failures.length) {
    console.error('[ts-ratchet] FAIL:');
    for (const f of failures) console.error('  ' + f);
    console.error('Either fix the new occurrences or, if intentional, run: pnpm ts:ratchet:update');
    process.exit(1);
}

let improved = false;
for (const d of Object.keys(curBaseline.byDir)) {
    if (!base.byDir[d]) continue;
    for (const m of METRICS) {
        if (curBaseline.byDir[d][m] < base.byDir[d][m]) improved = true;
    }
}

if (brandNew.length) {
    console.log(`[ts-ratchet] new directories (no prior baseline): ${brandNew.join(', ')}`);
}
if (improved) {
    console.log('[ts-ratchet] OK: counts decreased. Lower the baseline in the same commit: pnpm ts:ratchet:update');
} else {
    console.log('[ts-ratchet] OK: per-directory counts unchanged.');
}
process.exit(0);
