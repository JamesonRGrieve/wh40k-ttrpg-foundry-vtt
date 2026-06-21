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
 * The graduate-at-0 / strict / ratchet / persist state machine is shared with
 * the other keyed ratchets via scripts/lib/keyed-ratchet.mjs; this script keeps
 * its ESLint count acquisition, its extra `.eslintrc.json` warn->error flip,
 * the "no errors allowed" hard gate, and the legacy bare-integer migration.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs            # check (+ auto-flip on graduation)
 *   node scripts/lint-ratchet.mjs --update   # rebaseline non-strict rules
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runKeyedRatchet } from './lib/keyed-ratchet.mjs';

const BASELINE_PATH = resolve(process.cwd(), '.eslint-warning-baseline');
const ESLINTRC_PATH = resolve(process.cwd(), '.eslintrc.json');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

function computeCounts() {
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

    return {
        counts: byRule,
        data: { errorCount, warningCount, errorRules, configuredWarnRules, eslintrcText },
    };
}

/* ------------------------------------------------------------------ */
/*  Baseline load with legacy bare-integer migration.                  */
/* ------------------------------------------------------------------ */
function loadPrior(baselinePath) {
    const baseExists = existsSync(baselinePath);
    let prior = { strict: [], total: null, byRule: {} };
    if (baseExists) {
        const raw = readFileSync(baselinePath, 'utf8').trim();
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
                console.error(`[lint-ratchet] cannot parse baseline at ${baselinePath}`);
                process.exit(2);
            }
            prior = { strict: [], total: n, byRule: {} };
        }
    }
    const priorStrict = new Set(Array.isArray(prior.strict) ? prior.strict : []);
    return { baseExists, prior, priorStrict };
}

/* ------------------------------------------------------------------ */
/*  .eslintrc.json warn -> error flip for graduated rules.             */
/* ------------------------------------------------------------------ */
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

// Compute the flip from the final strict set (available once graduation ran).
function computeFlip(ctx) {
    return flipRulesToError(ctx.data.eslintrcText, ctx.strict);
}

function serializeBaseline(ctx) {
    const { counts: byRule, strict, data } = ctx;
    const ratchetedRules = {};
    for (const [rule, n] of Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b))) {
        if (!strict.has(rule)) ratchetedRules[rule] = n;
    }
    return `${JSON.stringify({ strict: [...strict].sort(), total: data.warningCount, byRule: ratchetedRules }, null, 2)}\n`;
}

// Mirror the original persistGraduation logging + the .eslintrc write side
// effect. The runner writes the baseline; this writes .eslintrc and logs.
function persistEslintAndLog(ctx, reason) {
    const { out: flippedText, changed: flippedRules } = computeFlip(ctx);
    const configNeedsWrite = flippedText !== ctx.data.eslintrcText;
    if (configNeedsWrite) writeFileSync(ESLINTRC_PATH, flippedText, 'utf8');
    if (ctx.newlyStrict.length) {
        console.log(`[lint-ratchet] GRADUATED to error (${reason}): ${ctx.newlyStrict.sort().join(', ')}`);
    }
    if (flippedRules.length) {
        console.log(`[lint-ratchet] .eslintrc.json: flipped warn -> error for ${flippedRules.sort().join(', ')}`);
    }
    console.log('  Commit .eslintrc.json and .eslint-warning-baseline alongside your changes.');
}

runKeyedRatchet({
    baselinePath: BASELINE_PATH,
    label: 'lint-ratchet',
    updateMode,
    shape: {
        computeCounts,
        loadPrior,
        graduationKeys: ({ data }) => data.configuredWarnRules,
        // The count that must be 0 for a strict rule: warnings + (1 if it also
        // surfaced as an error). Mirrors the original n = warns + errorHit.
        strictCountOf: (rule, { counts, data }) =>
            (counts[rule] || 0) + (data.errorRules.has(rule) ? 1 : 0),
        onStrictViolation(violations) {
            console.error('[lint-ratchet] STRICT-MODE VIOLATION:');
            for (const v of violations) console.error(`  ${v.key} (strict — must stay 0)`);
            console.error('');
            console.error('These rules graduated to `error` (count reached 0) and cannot regress.');
            console.error('Fix the new occurrences. `pnpm lint:ratchet:update` will NOT silence this.');
        },
        // ESLint errors are never allowed, in any mode — runs after the
        // strict-violation check, before update/init/ratchet.
        extraGuard({ data }) {
            if (data.errorCount > 0) {
                console.error(`[lint-ratchet] FAIL: eslint reported ${data.errorCount} error(s). Errors are not allowed.`);
                for (const id of data.errorRules) console.error(`  ${id}`);
                process.exit(1);
            }
        },
        serialize: serializeBaseline,
        ratchetFailures({ counts, prior, strict, data }) {
            const failures = [];
            for (const [rule, baseN] of Object.entries(prior.byRule || {})) {
                if (strict.has(rule)) continue;
                const cur = counts[rule] || 0;
                if (cur > baseN) failures.push(`${rule}: ${baseN} -> ${cur} (+${cur - baseN})`);
            }
            if (typeof prior.total === 'number' && data.warningCount > prior.total) {
                failures.push(`(total): ${prior.total} -> ${data.warningCount} (+${data.warningCount - prior.total})`);
            }
            return failures;
        },
        onRatchetFailure(failures) {
            console.error('[lint-ratchet] FAIL: eslint warnings increased.');
            for (const f of failures) console.error(`  ${f}`);
            console.error('Either fix the new warnings or, if intentional, run: pnpm lint:ratchet:update');
        },
        // Persist on a clean run when a rule graduated OR the .eslintrc flip is
        // needed (a strict rule still configured as `warn`).
        persistOnCleanRun(ctx) {
            const { out: flippedText } = computeFlip(ctx);
            const configNeedsWrite = flippedText !== ctx.data.eslintrcText;
            return ctx.newlyStrict.length > 0 || configNeedsWrite;
        },
        onPersist(ctx) {
            const { mode, data, strict } = ctx;
            if (mode === 'update') {
                persistEslintAndLog(ctx, 'on update');
                console.log(`[lint-ratchet] baseline updated. total=${data.warningCount}, strict=${strict.size} rule(s).`);
                return;
            }
            if (mode === 'init') {
                persistEslintAndLog(ctx, 'baseline init');
                console.log(`[lint-ratchet] baseline file missing — initialised. total=${data.warningCount}, strict=${strict.size}.`);
                return;
            }
            // mode === 'check' — graduation / config flip persisted on a clean run.
            persistEslintAndLog(ctx, 'count reached 0');
        },
        report({ prior, data, strict }) {
            const delta = typeof prior.total === 'number' ? prior.total - data.warningCount : 0;
            if (delta > 0) {
                console.log(`[lint-ratchet] OK: warnings ${prior.total} -> ${data.warningCount} (-${delta}). Run pnpm lint:ratchet:update to lower the floor.`);
            } else {
                console.log(`[lint-ratchet] OK: ${data.warningCount} warning(s), ${strict.size} strict rule(s), no regressions.`);
            }
        },
    },
});
