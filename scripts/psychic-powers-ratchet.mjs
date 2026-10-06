#!/usr/bin/env node
/* eslint-env node */
/**
 * Psychic-power content ratchet.
 *
 * tests/e2e/psychic-powers-all.spec.ts casts every psychic power in the local
 * compendium packs through the real cast pipeline (Tier B) and writes one result
 * file per pack to `.e2e-results/psychic-powers/packs/<pack>.json`, each power
 * marked pass/fail with failure CATEGORIES. Content defects never fail that spec;
 * this script is the gate:
 *
 *   1. The PASSING-power count cannot fall.
 *   2. Each failure category's count cannot rise. A category driven to 0
 *      GRADUATES to strict (locked at 0 thereafter; `--update` cannot loosen it).
 *   3. When every power passes, the whole gate auto-flips to strict: any failing
 *      power is then a hard fail.
 * Graduations persist on a normal (check) run too, like ts:ratchet.
 *
 * It first aggregates the most recent run's pack files into
 * `.e2e-results/psychic-powers.json` (totals, per-category, per-pack, per-line,
 * runtime diagnostics, every power's reasons). Only a COMPLETE, UNLIMITED run
 * gates: with no results (Foundry dump absent, spec not run) it prints a skip
 * line and exits 0; a `PSYCHIC_POWER_LIMIT` smoke run, or a run covering fewer
 * packs than are checked out, is summarised but not gated.
 *
 * Update via `pnpm psychic:ratchet:update`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PACK_RESULTS_DIR = resolve(ROOT, '.e2e-results', 'psychic-powers', 'packs');
const SUMMARY = resolve(ROOT, '.e2e-results', 'psychic-powers.json');
const BASELINE = resolve(ROOT, '.psychic-powers-baseline');
const PACK_ROOTS = [resolve(ROOT, 'src', 'packs-private'), resolve(ROOT, 'src', 'packs')];
const PACK_DIR_SUFFIX = 'items-psychic-powers';
const UPDATE = process.argv.includes('--update');
const TAG = '[psychic-ratchet]';

const log = (line) => process.stdout.write(`${line}\n`);
const logError = (line) => process.stderr.write(`${line}\n`);

/** Pack directory names checked out locally — the spec's per-pack denominator. */
function localPackNames() {
    const names = new Set();
    for (const root of PACK_ROOTS) {
        if (!existsSync(root)) continue;
        for (const line of readdirSync(root, { withFileTypes: true })) {
            if (!line.isDirectory() || line.name.startsWith('.')) continue;
            for (const pack of readdirSync(resolve(root, line.name), { withFileTypes: true })) {
                if (pack.isDirectory() && pack.name.endsWith(PACK_DIR_SUFFIX)) names.add(pack.name);
            }
        }
    }
    return names;
}

/** The pack files of the most recent run (one runId = one Playwright invocation). */
function latestRunPackFiles() {
    if (!existsSync(PACK_RESULTS_DIR)) return [];
    const files = readdirSync(PACK_RESULTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(resolve(PACK_RESULTS_DIR, f), 'utf8')));
    if (files.length === 0) return [];
    const newest = files.reduce((a, b) => (a.generatedAt >= b.generatedAt ? a : b));
    return files.filter((f) => f.runId === newest.runId);
}

/** Increment `counts[key]` by `n`. */
function bump(counts, key, n = 1) {
    counts[key] = (counts[key] ?? 0) + n;
}

/** Aggregate one run's pack files into the summary report. */
function aggregate(runFiles, expectedPacks) {
    const byPack = {};
    const byLine = {};
    const categories = {};
    const powers = [];
    const diagnostics = { focusStringCoerced: 0, focusModifierLost: 0, rangeDroppedAtRuntime: 0 };
    let limited = false;
    for (const file of runFiles) {
        if (file.limit !== null) limited = true;
        byPack[file.pack] = { powers: file.powers.length, passing: file.passing, categories: file.categories };
        for (const [category, n] of Object.entries(file.categories)) bump(categories, category, n);
        for (const power of file.powers) {
            powers.push(power);
            if (!(power.line in byLine)) byLine[power.line] = { powers: 0, passing: 0, categories: {} };
            const lineBucket = byLine[power.line];
            lineBucket.powers += 1;
            if (power.pass) lineBucket.passing += 1;
            for (const category of new Set(power.failures.map((f) => f.category))) bump(lineBucket.categories, category);
            const coerced = power.diagnostics.focusStringCoerced;
            if (coerced !== null) {
                diagnostics.focusStringCoerced += 1;
                // The prose names a non-zero modifier ("(+10)") the live document no longer carries.
                if (/\([+-]\s*[1-9]\d*\)/.test(coerced.raw) && coerced.liveModifier === 0) diagnostics.focusModifierLost += 1;
            }
            if (power.diagnostics.rangeDroppedAtRuntime) diagnostics.rangeDroppedAtRuntime += 1;
        }
    }
    const ran = new Set(runFiles.map((f) => f.pack));
    const missingPacks = [...expectedPacks].filter((p) => !ran.has(p)).sort();
    const passing = powers.filter((p) => p.pass).length;
    return {
        runId: runFiles[0]?.runId ?? null,
        generatedAt: new Date().toISOString(),
        limited,
        complete: !limited && missingPacks.length === 0,
        missingPacks,
        totals: { powers: powers.length, passing, failing: powers.length - passing },
        categories,
        byPack,
        byLine,
        diagnostics,
        powers,
    };
}

/** Non-zero entries of a count map, sorted by key. */
function nonZero(counts) {
    return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => a.localeCompare(b));
}

const packFiles = latestRunPackFiles();
if (packFiles.length === 0) {
    log(`${TAG} skipped — no psychic-power results (run tests/e2e/psychic-powers-all.spec.ts via Tier B to produce them)`);
    process.exit(0);
}

const summary = aggregate(packFiles, localPackNames());
writeFileSync(SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
log(`${TAG} ${summary.totals.passing}/${summary.totals.powers} powers passing (run ${summary.runId}) → ${SUMMARY}`);
for (const [category, n] of nonZero(summary.categories)) log(`  ${category}: ${n}`);

if (!summary.complete) {
    const why = summary.limited ? 'a PSYCHIC_POWER_LIMIT smoke run' : `a partial run (missing packs: ${summary.missingPacks.join(', ')})`;
    log(`${TAG} not gating — the latest results are ${why}; a full unlimited run is required.`);
    process.exit(0);
}

const current = {
    passing: summary.totals.passing,
    total: summary.totals.powers,
    categories: Object.fromEntries(nonZero(summary.categories)),
};
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const strictSet = new Set(baseline?.strictCategories ?? []);
const writeBaseline = (counts, strict) =>
    writeFileSync(BASELINE, `${JSON.stringify({ ...counts, strict, strictCategories: [...strictSet].sort() }, null, 2)}\n`, 'utf8');

if (UPDATE || baseline === null) {
    const reappeared = Object.keys(current.categories).filter((c) => strictSet.has(c));
    if (baseline?.strict === true && current.passing < current.total) reappeared.push('failing powers under the all-pass strict gate');
    if (reappeared.length > 0) {
        logError(
            `${TAG} refusing to update — strict gate violated (${reappeared.join(', ')}). Demote by editing ${BASELINE} and explaining why in the commit.`,
        );
        process.exit(1);
    }
    // A category tracked before and now absent (0) graduates to strict.
    for (const category of Object.keys(baseline?.categories ?? {})) if (!(category in current.categories)) strictSet.add(category);
    const strict = baseline?.strict === true || current.passing === current.total;
    writeBaseline(current, strict);
    log(
        `${TAG} baseline ${baseline === null ? 'initialised' : 'updated'}: ${current.passing}/${current.total} passing; ${strictSet.size} strict categor${
            strictSet.size === 1 ? 'y' : 'ies'
        }${strict ? '; gate STRICT (all powers pass)' : ''}.`,
    );
    process.exit(0);
}

const regressions = [];
if (baseline.strict === true && current.passing < current.total) regressions.push(`strict: every power passed, now ${current.total - current.passing} fail`);
if (current.passing < baseline.passing) regressions.push(`passing: ${baseline.passing} -> ${current.passing} (-${baseline.passing - current.passing})`);
for (const [category, n] of Object.entries(current.categories)) {
    const was = baseline.categories[category] ?? 0;
    if (strictSet.has(category)) regressions.push(`${category}: graduated to 0, but ${n} reappeared`);
    else if (n > was) regressions.push(`${category}: ${was} -> ${n} (+${n - was})`);
}

if (regressions.length > 0) {
    logError(`${TAG} FAIL — psychic-power content regressed:`);
    for (const r of regressions) logError(`  ${r}`);
    logError(`See ${SUMMARY} for per-power reasons, or, if intentional, run \`pnpm psychic:ratchet:update\`.`);
    process.exit(1);
}

// Persist graduations on a check run too (like ts:ratchet): a category that reached
// 0 and an all-passing run lock in immediately, without waiting for `--update`.
const graduated = Object.keys(baseline.categories).filter((c) => !(c in current.categories) && !strictSet.has(c));
const flipStrict = baseline.strict !== true && current.passing === current.total;
if (graduated.length > 0 || flipStrict) {
    for (const c of graduated) strictSet.add(c);
    writeBaseline({ passing: baseline.passing, total: baseline.total, categories: baseline.categories }, baseline.strict === true || flipStrict);
    log(`${TAG} graduated to strict: ${[...graduated, ...(flipStrict ? ['ALL POWERS PASS'] : [])].join(', ')} — commit ${BASELINE}.`);
}

const improved = current.passing > baseline.passing || Object.entries(baseline.categories).some(([c, n]) => (current.categories[c] ?? 0) < n);
log(
    improved
        ? `${TAG} OK: content improved — lock it in with \`pnpm psychic:ratchet:update\`.`
        : `${TAG} OK: no regressions (${current.passing}/${current.total} passing).`,
);
process.exit(0);
