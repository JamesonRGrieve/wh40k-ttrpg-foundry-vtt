#!/usr/bin/env node
/**
 * Coverage-symmetry ratchet. The strict gate (scripts/coverage-symmetry.mjs)
 * fails on any missing pair, which we cannot meet today (33 sheets, 0 stories
 * for most). This ratchet allows progress: it captures the current count of
 * missing pairs in `.symmetry-baseline` and refuses commits that increase it.
 * As stories/tests are added, the baseline drops; eventually the strict gate
 * (run separately, or by setting baseline to {0,0,0}) takes over.
 *
 * Update via `pnpm symmetry:ratchet:update`.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE = resolve(process.cwd(), '.symmetry-baseline');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

let report;
try {
    const out = execSync('node scripts/coverage-symmetry.mjs --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    report = JSON.parse(out);
} catch (err) {
    // Non-zero exit means missing pairs — JSON is still on stdout.
    report = JSON.parse(err.stdout?.toString() || '{}');
}

const cur = {
    sheets: report.sheetMissing?.length ?? 0,
    data: report.dataMissing?.length ?? 0,
    documents: report.docsMissing?.length ?? 0,
};
const serialized = JSON.stringify(cur, null, 2) + '\n';

if (updateMode) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log(`[symmetry-ratchet] baseline updated: sheets=${cur.sheets} data=${cur.data} documents=${cur.documents}`);
    process.exit(0);
}

if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log(`[symmetry-ratchet] baseline file missing — initialised: sheets=${cur.sheets} data=${cur.data} documents=${cur.documents}`);
    process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];
for (const k of ['sheets', 'data', 'documents']) {
    if (cur[k] > base[k]) failures.push(`${k}: ${base[k]} -> ${cur[k]} (+${cur[k] - base[k]})`);
}

if (failures.length) {
    console.error('[symmetry-ratchet] FAIL — missing-pair count regressed:');
    for (const f of failures) console.error('  ' + f);
    console.error('Either add the missing .stories.ts/.test.ts or, if intentional, run: pnpm symmetry:ratchet:update');
    process.exit(1);
}

const improved = ['sheets', 'data', 'documents'].some((k) => cur[k] < base[k]);
if (improved) {
    console.log(
        `[symmetry-ratchet] OK: missing pairs decreased. Lower the baseline: pnpm symmetry:ratchet:update`,
    );
} else {
    console.log(`[symmetry-ratchet] OK: sheets=${cur.sheets} data=${cur.data} documents=${cur.documents} (unchanged).`);
}
process.exit(0);
