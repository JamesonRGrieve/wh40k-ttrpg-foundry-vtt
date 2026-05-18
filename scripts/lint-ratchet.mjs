#!/usr/bin/env node
/**
 * ESLint warning ratchet with per-rule auto-flip to hard gate.
 *
 * Runs the strong ESLint config over the full surface
 * (`src/module/ src/templates/ stories/ tests/` — app, story, and test
 * code share one ruleset) and compares per-rule warning counts to
 * `.eslint-warning-baseline`.
 *
 * Two enforcement modes per rule (mirrors `scripts/ts-ratchet.mjs`):
 *
 *   1. RATCHET (default) — a rule's warning count may not rise above its
 *      baseline, and the aggregate total may not rise. Lower it, then
 *      `pnpm lint:ratchet:update` to record the new floor.
 *
 *   2. STRICT — once a rule we configure as `warn` reaches 0 occurrences it
 *      auto-graduates: it is recorded in the baseline's `strict` list AND
 *      flipped `warn` -> `error` in `.eslintrc.json`, so ESLint itself
 *      enforces it from the next run on. Any later occurrence is a hard
 *      ESLint error (the ratchet already refuses to pass with errors) and
 *      `--update` will not un-graduate it — that requires a manual baseline
 *      edit, justified in the commit.
 *
 * Graduation is persisted on every run (not just `--update`), so the
 * pre-commit hook performs the flip automatically. ESLint errors are never
 * allowed under any mode.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs            # check (+ auto-flip on graduation)
 *   node scripts/lint-ratchet.mjs --update   # rebaseline non-strict rules
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const BASELINE_PATH = resolve(process.cwd(), '.eslint-warning-baseline');
const ESLINTRC_PATH = resolve(process.cwd(), '.eslintrc.json');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

/* ------------------------------------------------------------------ */
/*  1. Run ESLint over the full app + story + test surface.            */
/* ------------------------------------------------------------------ */
let lintOutput;
const lintOutputPath = resolve(tmpdir(), `wh40k-eslint-${process.pid}.json`);
try {
    execSync(`/bin/bash -lc './node_modules/.bin/eslint src/module/ src/templates/ stories/ tests/ --ext .ts --format json > "${lintOutputPath}"'`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (err) {
    // ESLint exits non-zero on errors; the JSON is still written either way.
    if (existsSync(lintOutputPath)) {
        lintOutput = readFileSync(lintOutputPath, 'utf8');
    } else {
        lintOutput = err.stdout?.toString() || '';
    }
}

if (!lintOutput && existsSync(lintOutputPath)) {
    lintOutput = readFileSync(lintOutputPath, 'utf8');
}
if (existsSync(lintOutputPath)) {
    unlinkSync(lintOutputPath);
}

let results;
try {
    results = JSON.parse(lintOutput);
} catch (err) {
    console.error('[lint-ratchet] failed to parse eslint JSON output');
    console.error(err.message);
    process.exit(2);
}

/* ------------------------------------------------------------------ */
/*  2. Tally errors and per-rule warnings.                             */
/* ------------------------------------------------------------------ */
const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
const byRule = {};
let warningCount = 0;
const errorRules = new Set();
for (const file of results) {
    for (const m of file.messages) {
        const id = m.ruleId || '(core)';
        if (m.severity === 2) {
            errorRules.add(id);
        } else if (m.severity === 1) {
            byRule[id] = (byRule[id] || 0) + 1;
            warningCount++;
        }
    }
}

/* ------------------------------------------------------------------ */
/*  3. Collect the rules we configure as `warn` (graduation-eligible). */
/* ------------------------------------------------------------------ */
const eslintrcText = readFileSync(ESLINTRC_PATH, 'utf8');
const eslintrc = JSON.parse(eslintrcText);
const configuredWarnRules = new Set();
function collectWarn(rules) {
    if (!rules) return;
    for (const [name, value] of Object.entries(rules)) {
        const sev = Array.isArray(value) ? value[0] : value;
        if (sev === 'warn' || sev === 1) configuredWarnRules.add(name);
    }
}
collectWarn(eslintrc.rules);
for (const ov of eslintrc.overrides || []) collectWarn(ov.rules);

/* ------------------------------------------------------------------ */
/*  4. Load baseline (JSON; legacy bare-integer is migrated).          */
/* ------------------------------------------------------------------ */
const baseExists = existsSync(BASELINE_PATH);
let prior = { strict: [], total: null, byRule: {} };
if (baseExists) {
    const raw = readFileSync(BASELINE_PATH, 'utf8').trim();
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'number') {
            prior = { strict: [], total: parsed, byRule: {} };
        } else {
            prior = { strict: [], total: null, byRule: {}, ...parsed };
        }
    } catch {
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) {
            console.error(`[lint-ratchet] cannot parse baseline at ${BASELINE_PATH}`);
            process.exit(2);
        }
        prior = { strict: [], total: n, byRule: {} };
    }
}
const priorStrict = new Set(Array.isArray(prior.strict) ? prior.strict : []);

/* ------------------------------------------------------------------ */
/*  5. Auto-flip: configured `warn` rules now at 0 graduate to strict. */
/* ------------------------------------------------------------------ */
const strict = new Set(priorStrict);
const newlyStrict = [];
for (const rule of configuredWarnRules) {
    if (strict.has(rule)) continue;
    if (!(byRule[rule] > 0) && !errorRules.has(rule)) {
        strict.add(rule);
        newlyStrict.push(rule);
    }
}

// Apply the `warn` -> `error` flip in .eslintrc.json for every strict rule
// that is still configured as `warn` (covers newly graduated rules and any
// strict rule a manual edit reverted).
function flipRulesToError(text, rules) {
    let out = text;
    const changed = [];
    for (const rule of rules) {
        const esc = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reStr = new RegExp(`("${esc}":\\s*)"warn"`, 'g');
        const reArr = new RegExp(`("${esc}":\\s*\\[\\s*)"warn"`, 'g');
        let touched = false;
        out = out.replace(reStr, (_, p) => { touched = true; return `${p}"error"`; });
        out = out.replace(reArr, (_, p) => { touched = true; return `${p}"error"`; });
        if (touched) changed.push(rule);
    }
    return { out, changed };
}

const { out: flippedText, changed: flippedRules } = flipRulesToError(eslintrcText, strict);
const configNeedsWrite = flippedText !== eslintrcText;

/* ------------------------------------------------------------------ */
/*  6. Strict-mode violations (a graduated rule reappeared).           */
/* ------------------------------------------------------------------ */
const strictViolations = [];
for (const rule of strict) {
    const n = (byRule[rule] || 0) + (errorRules.has(rule) ? 1 : 0);
    if (n > 0) strictViolations.push(`${rule} (strict — must stay 0)`);
}

if (strictViolations.length) {
    console.error('[lint-ratchet] STRICT-MODE VIOLATION:');
    for (const v of strictViolations) console.error(`  ${v}`);
    console.error('');
    console.error('These rules graduated to `error` (count reached 0) and cannot regress.');
    console.error('Fix the new occurrences. `pnpm lint:ratchet:update` will NOT silence this.');
    process.exit(1);
}

if (errorCount > 0) {
    console.error(`[lint-ratchet] FAIL: eslint reported ${errorCount} error(s). Errors are not allowed.`);
    for (const id of errorRules) console.error(`  ${id}`);
    process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  7. Serialize the would-be baseline.                                */
/* ------------------------------------------------------------------ */
function serializeBaseline() {
    const ratchetedRules = {};
    for (const [rule, n] of Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b))) {
        if (!strict.has(rule)) ratchetedRules[rule] = n;
    }
    return `${JSON.stringify({ strict: [...strict].sort(), total: warningCount, byRule: ratchetedRules }, null, 2)}\n`;
}

function persistGraduation(reason) {
    if (configNeedsWrite) writeFileSync(ESLINTRC_PATH, flippedText, 'utf8');
    writeFileSync(BASELINE_PATH, serializeBaseline(), 'utf8');
    if (newlyStrict.length) {
        console.log(`[lint-ratchet] GRADUATED to error (${reason}): ${newlyStrict.sort().join(', ')}`);
    }
    if (flippedRules.length) {
        console.log(`[lint-ratchet] .eslintrc.json: flipped warn -> error for ${flippedRules.sort().join(', ')}`);
    }
    console.log('  Commit .eslintrc.json and .eslint-warning-baseline alongside your changes.');
}

if (updateMode) {
    persistGraduation('on update');
    console.log(`[lint-ratchet] baseline updated. total=${warningCount}, strict=${strict.size} rule(s).`);
    process.exit(0);
}

if (!baseExists) {
    persistGraduation('baseline init');
    console.log(`[lint-ratchet] baseline file missing — initialised. total=${warningCount}, strict=${strict.size}.`);
    process.exit(0);
}

/* ------------------------------------------------------------------ */
/*  8. Ratchet non-strict rules: no per-rule rise, no total rise.      */
/* ------------------------------------------------------------------ */
const failures = [];
for (const [rule, baseN] of Object.entries(prior.byRule || {})) {
    if (strict.has(rule)) continue;
    const cur = byRule[rule] || 0;
    if (cur > baseN) failures.push(`${rule}: ${baseN} -> ${cur} (+${cur - baseN})`);
}
if (typeof prior.total === 'number' && warningCount > prior.total) {
    failures.push(`(total): ${prior.total} -> ${warningCount} (+${warningCount - prior.total})`);
}

if (failures.length) {
    console.error('[lint-ratchet] FAIL: eslint warnings increased.');
    for (const f of failures) console.error(`  ${f}`);
    console.error('Either fix the new warnings or, if intentional, run: pnpm lint:ratchet:update');
    process.exit(1);
}

// Persist graduations that happened this run (config flip + baseline),
// mirroring ts-ratchet: graduation is recorded even outside --update so the
// next commit enforces it.
if (newlyStrict.length || configNeedsWrite) {
    persistGraduation('count reached 0');
}

const delta = typeof prior.total === 'number' ? prior.total - warningCount : 0;
if (delta > 0) {
    console.log(`[lint-ratchet] OK: warnings ${prior.total} -> ${warningCount} (-${delta}). Run pnpm lint:ratchet:update to lower the floor.`);
} else {
    console.log(`[lint-ratchet] OK: ${warningCount} warning(s), ${strict.size} strict rule(s), no regressions.`);
}
process.exit(0);
