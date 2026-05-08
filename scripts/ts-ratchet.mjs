#!/usr/bin/env node
/**
 * Per-rule, per-directory TS-strictness ratchet. Runs scripts/ts-coverage.mjs
 * (silently) and compares the result to .ts-coverage-baseline. Fails when ANY
 * (metric, directory) pair regresses upward. New directories are added at
 * their current count; removed directories are dropped. Update via
 * `pnpm ts:ratchet:update`.
 *
 * This is independent of the `pnpm typecheck` hard gate — that gates total
 * tsc errors (must be zero); this gates the four manual-suppression patterns
 * agents are most likely to introduce when fixing types under time pressure.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const REPORT = resolve(process.cwd(), '.ts-coverage.json');
const BASELINE = resolve(process.cwd(), '.ts-coverage-baseline');
const METRICS = ['any', 'asAny', 'tsExpectError', 'tsIgnore'];
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

const ROOT = resolve(process.cwd(), 'src/module');
const PATTERNS = {
    any: /(^|[^A-Za-z0-9_$]):\s*any\b/g,
    asAny: /\bas\s+any\b/g,
    tsExpectError: /@ts-expect-error\b/g,
    tsIgnore: /@ts-ignore\b/g,
};

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const stat = statSync(full);
        if (stat.isDirectory()) yield* walk(full);
        else if (stat.isFile() && name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.test.ts')) yield full;
    }
}

function topLevelDir(file) {
    const rel = relative(ROOT, file);
    const parts = rel.split(sep);
    return parts.length === 1 ? '_root' : parts[0];
}

const byDir = {};
const byFile = {};
const totals = Object.fromEntries(METRICS.map((m) => [m, 0]));
let totalFiles = 0;

for (const file of walk(ROOT)) {
    const source = readFileSync(file, 'utf8');
    const counts = Object.fromEntries(METRICS.map((m) => [m, 0]));
    for (const metric of METRICS) {
        const regex = new RegExp(PATTERNS[metric].source, PATTERNS[metric].flags);
        while (regex.exec(source) !== null) {
            counts[metric]++;
            totals[metric]++;
        }
    }

    const dir = topLevelDir(file);
    byDir[dir] ??= Object.fromEntries([...METRICS.map((m) => [m, 0]), ['files', 0]]);
    for (const metric of METRICS) byDir[dir][metric] += counts[metric];
    byDir[dir].files++;

    const rel = relative(process.cwd(), file);
    if (METRICS.some((metric) => counts[metric] > 0)) byFile[rel] = counts;
    totalFiles++;
}

const cur = {
    generatedAt: new Date().toISOString(),
    summary: { files: totalFiles, ...totals },
    byDir,
    byFile,
};
writeFileSync(REPORT, JSON.stringify(cur, null, 2) + '\n', 'utf8');

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
