#!/usr/bin/env node
/**
 * Per-TS-code ratchet over a tsc run. Defaults to tsconfig.strict.json (the
 * "next-tier" strictness flags) — also reusable for tsconfig.test.json (test
 * and story compilation) via `--config` and `--baseline`.
 *
 * Two enforcement modes per TS error code:
 *
 *   1. RATCHET (default) — per-code error counts may only DECREASE. Brand-new
 *      codes appearing for the first time are added at their current count
 *      (no fail).
 *
 *   2. STRICT — once a code's count reaches 0 it auto-graduates. The baseline
 *      records the code in `"strict": [...]` and any future occurrence is a
 *      hard fail with no `--update` escape hatch.
 *
 * Usage:
 *   node scripts/strict-ratchet.mjs                                                                     # default: tsconfig.strict.json + .strict-coverage-baseline
 *   node scripts/strict-ratchet.mjs --update
 *   node scripts/strict-ratchet.mjs --config tsconfig.test.json --baseline .test-typecheck-baseline --report .test-typecheck-coverage.json
 *
 * Approximate flag → TS code mapping for the default strict tsconfig:
 *   noImplicitOverride                    → TS4114
 *   noFallthroughCasesInSwitch            → TS7029
 *   forceConsistentCasingInFileNames      → TS1149
 *   noImplicitReturns                     → TS7030
 *   noUncheckedIndexedAccess              → TS18048, TS2532, TS2538, TS2722
 *   noPropertyAccessFromIndexSignature    → TS4111
 *   exactOptionalPropertyTypes            → TS2375, TS2379, TS2412
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
function arg(name, fallback) {
    const i = argv.indexOf(name);
    if (i === -1) return fallback;
    return argv[i + 1];
}

const config = arg('--config', 'tsconfig.strict.json');
const baseline = arg('--baseline', '.strict-coverage-baseline');
const reportPath = arg('--report', '.strict-coverage.json');
const label = arg('--label', 'strict-ratchet');
const updateMode = argv.includes('--update');

const REPORT = resolve(process.cwd(), reportPath);
const BASELINE = resolve(process.cwd(), baseline);

execSync(`node scripts/strict-coverage.mjs --config ${config} --out ${reportPath} --quiet`, { stdio: 'inherit' });

if (!existsSync(REPORT)) {
    console.error(`[${label}] missing ${REPORT} — strict-coverage did not produce a report.`);
    process.exit(2);
}

const cur = JSON.parse(readFileSync(REPORT, 'utf8'));
const curByCode = cur.byCode ?? {};

const baseExists = existsSync(BASELINE);
const prior = baseExists ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const priorByCode = prior?.byCode ?? {};
const priorStrict = new Set(Array.isArray(prior?.strict) ? prior.strict : []);

// Auto-flip: any code whose current count is 0 graduates to strict. Codes that
// graduated previously stay graduated even if not in the current report.
const strict = new Set(priorStrict);
const newlyStrict = [];

const allCodes = new Set([...Object.keys(curByCode), ...Object.keys(priorByCode)]);
for (const code of allCodes) {
    const count = curByCode[code] ?? 0;
    if (count === 0 && !strict.has(code)) {
        strict.add(code);
        newlyStrict.push(code);
    }
}

// Hard-fail any strict code with count > 0.
const strictViolations = [];
for (const code of [...strict].sort()) {
    const count = curByCode[code] ?? 0;
    if (count > 0) strictViolations.push(`${code}: ${count} (strict — must be 0)`);
}

if (strictViolations.length) {
    console.error(`[${label}] STRICT-MODE VIOLATION:`);
    for (const v of strictViolations) console.error('  ' + v);
    console.error('');
    console.error('These TS error codes previously graduated to strict (count = 0) and cannot regress.');
    console.error(`Fix the new occurrences. \`--update\` will NOT silence this.`);
    console.error(`If a graduation was premature, edit ${baseline} manually.`);
    process.exit(1);
}

function pickBaselineShape(report, strictSet) {
    const out = {
        strict: [...strictSet].sort(),
        config: report.config ?? config,
        totals: { totalErrors: report.summary.totalErrors },
        byCode: {},
    };
    for (const code of Object.keys(report.byCode).sort()) out.byCode[code] = report.byCode[code];
    return out;
}

const curBaseline = pickBaselineShape(cur, strict);
const serialized = JSON.stringify(curBaseline, null, 2) + '\n';

if (updateMode) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log(`[${label}] baseline updated. Total errors:`, cur.summary.totalErrors);
    if (newlyStrict.length) console.log(`[${label}] GRADUATED to strict on update: ${newlyStrict.join(', ')}`);
    if (strict.size) console.log(`[${label}] strict codes: ${[...strict].sort().join(', ')}`);
    process.exit(0);
}

if (!baseExists) {
    writeFileSync(BASELINE, serialized, 'utf8');
    console.log(`[${label}] baseline file missing — initialised. Total errors:`, cur.summary.totalErrors);
    if (strict.size) console.log(`[${label}] strict codes: ${[...strict].sort().join(', ')}`);
    process.exit(0);
}

// Standard ratchet for non-strict codes: per-code counts may not rise.
const failures = [];
for (const code of Object.keys(curByCode)) {
    if (strict.has(code)) continue;
    const c = curByCode[code];
    const b = priorByCode[code] ?? null;
    if (b === null) continue;
    if (c > b) failures.push(`${code}: ${b} -> ${c} (+${c - b})`);
}

if (failures.length) {
    console.error(`[${label}] FAIL:`);
    for (const f of failures) console.error('  ' + f);
    console.error(`Either fix the new occurrences or, if intentional, run with --update.`);
    process.exit(1);
}

// Persist auto-flips and any brand-new codes even on a clean run.
const brandNew = Object.keys(curByCode).filter((c) => !(c in priorByCode));
if (newlyStrict.length || brandNew.length) {
    writeFileSync(BASELINE, serialized, 'utf8');
    if (newlyStrict.length) {
        console.log(`[${label}] GRADUATED to strict (count reached 0): ${newlyStrict.join(', ')}`);
        console.log(`  ${baseline} updated. Commit it alongside your changes.`);
    }
    if (brandNew.length) {
        console.log(`[${label}] new TS codes (no prior baseline): ${brandNew.join(', ')}`);
        console.log('  Recorded at current counts. They ratchet downward from here.');
    }
}

let improved = false;
for (const code of Object.keys(curByCode)) {
    if (code in priorByCode && curByCode[code] < priorByCode[code]) improved = true;
}

if (improved && !newlyStrict.length) {
    console.log(`[${label}] OK: counts decreased. Lower the baseline in the same commit (--update).`);
} else if (!newlyStrict.length && !brandNew.length) {
    console.log(`[${label}] OK: per-code counts unchanged.`);
}
if (strict.size) console.log(`[${label}] strict codes (must remain 0): ${[...strict].sort().join(', ')}`);
process.exit(0);
