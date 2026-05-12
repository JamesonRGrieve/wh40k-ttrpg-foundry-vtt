#!/usr/bin/env node
/**
 * type-coverage ratchet. Computes the % of source positions whose inferred
 * type is non-`any` (under `--strict`, which also counts implicit-any and
 * non-strict-null positions). Where `ts:ratchet` counts SYNTACTIC suppression
 * markers (`as any`, `@ts-expect-error`), `type-coverage` measures INFERRED
 * coverage and catches `any` leaking through Foundry types, JSON.parse,
 * hook payloads, etc. that regex scans cannot see.
 *
 * Ratchet semantics:
 *   - The "covered" count may NEVER drop, period (any positive ratchet on a
 *     fraction would let totals creep up without affecting the percentage).
 *   - The "total" count is informational — it grows as the codebase grows.
 *   - When `covered === total`, type-coverage:strict is at 100% and we
 *     auto-flip into "strict mode": both numbers must stay equal. A future
 *     drop is a hard fail with no ratchet escape hatch.
 *
 * Baseline file: .type-coverage-baseline (JSON, includes `strict: bool`).
 *
 * Usage:
 *   node scripts/type-coverage-ratchet.mjs           # check
 *   node scripts/type-coverage-ratchet.mjs --update  # rewrite baseline
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE = resolve(process.cwd(), '.type-coverage-baseline');
const args = new Set(process.argv.slice(2));
const updateMode = args.has('--update');

let stdout = '';
try {
    stdout = execSync('./node_modules/.bin/type-coverage --strict --no-detail', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
    });
} catch (err) {
    stdout = err.stdout?.toString() ?? '';
}

// type-coverage prints e.g. `(132197 / 134404) 98.35%`
const match = /\((\d+)\s*\/\s*(\d+)\)\s+([\d.]+)%/.exec(stdout);
if (!match) {
    console.error('[type-coverage-ratchet] could not parse type-coverage output:');
    console.error(stdout);
    process.exit(2);
}

const covered = Number(match[1]);
const total = Number(match[2]);
const percent = Number(match[3]);

const baseExists = existsSync(BASELINE);
const prior = baseExists ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const priorStrict = Boolean(prior?.strict);

const isAtCeiling = covered === total;
const strict = priorStrict || isAtCeiling;

if (priorStrict && !isAtCeiling) {
    console.error('[type-coverage-ratchet] STRICT-MODE VIOLATION: type-coverage previously hit 100% strict but has regressed.');
    console.error(`  covered=${covered} total=${total} (${percent}%) — gap=${total - covered}`);
    console.error('Run `pnpm type-coverage --strict --detail` to see which positions slipped to any.');
    console.error('`--update` will NOT silence this. Fix the regressions or edit the baseline manually.');
    process.exit(1);
}

function writeBaseline() {
    const out = { covered, total, percent, strict };
    writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

if (updateMode) {
    writeBaseline();
    console.log(`[type-coverage-ratchet] baseline updated: covered=${covered} total=${total} (${percent}%)${strict ? ' [strict]' : ''}`);
    process.exit(0);
}

if (!baseExists) {
    writeBaseline();
    console.log(`[type-coverage-ratchet] baseline file missing — initialised: covered=${covered} total=${total} (${percent}%)${strict ? ' [strict]' : ''}`);
    process.exit(0);
}

const priorCovered = Number(prior.covered ?? 0);

if (covered < priorCovered) {
    console.error('[type-coverage-ratchet] FAIL:');
    console.error(`  covered: ${priorCovered} -> ${covered} (-${priorCovered - covered})`);
    console.error(`  current: ${covered} / ${total} (${percent}%)`);
    console.error('Either fix the new `any` positions or, if intentional, run: pnpm type-coverage:ratchet:update');
    process.exit(1);
}

// If we just hit 100%, persist the strict flag for next run.
if (isAtCeiling && !priorStrict) {
    writeBaseline();
    console.log(`[type-coverage-ratchet] GRADUATED to strict: type-coverage:strict reached 100% (${covered}/${total}).`);
    console.log('  .type-coverage-baseline updated. Commit it alongside your changes.');
    process.exit(0);
}

if (covered > priorCovered) {
    console.log(`[type-coverage-ratchet] OK: covered ${priorCovered} -> ${covered} (${percent}%). Lower the baseline in the same commit: pnpm type-coverage:ratchet:update`);
} else {
    console.log(`[type-coverage-ratchet] OK: covered=${covered} total=${total} (${percent}%)${strict ? ' [strict]' : ''}`);
}
process.exit(0);
