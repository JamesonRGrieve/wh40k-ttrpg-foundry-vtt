#!/usr/bin/env node
/**
 * ESLint warning ratchet. Runs `pnpm lint` and compares the warning
 * count to .eslint-warning-baseline. Fails when the count goes UP,
 * succeeds when it goes down or stays the same. The baseline is
 * committed to git; once a PR lowers it, update the baseline file in
 * the same commit.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs            # check
 *   node scripts/lint-ratchet.mjs --update   # rewrite baseline to current count
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE_PATH = resolve(process.cwd(), '.eslint-warning-baseline');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

let lintOutput;
try {
    lintOutput = execSync('pnpm exec eslint src/module/ --ext .ts --format json', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (err) {
    // ESLint exits non-zero when warnings exist with --max-warnings 0, but with the
    // default config it only exits non-zero on errors. Either way the JSON is on stdout.
    lintOutput = err.stdout?.toString() || '';
}

let results;
try {
    results = JSON.parse(lintOutput);
} catch (err) {
    console.error('[lint-ratchet] failed to parse eslint JSON output');
    console.error(err.message);
    process.exit(2);
}

const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

if (errorCount > 0) {
    console.error(`[lint-ratchet] FAIL: eslint reported ${errorCount} error(s). Errors are not allowed.`);
    process.exit(1);
}

if (updateMode) {
    writeFileSync(BASELINE_PATH, `${warningCount}\n`, 'utf8');
    console.log(`[lint-ratchet] baseline updated to ${warningCount}`);
    process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
    writeFileSync(BASELINE_PATH, `${warningCount}\n`, 'utf8');
    console.log(`[lint-ratchet] baseline file missing — initialised at ${warningCount}`);
    process.exit(0);
}

const baseline = parseInt(readFileSync(BASELINE_PATH, 'utf8').trim(), 10);
if (Number.isNaN(baseline)) {
    console.error(`[lint-ratchet] cannot parse baseline at ${BASELINE_PATH}`);
    process.exit(2);
}

if (warningCount > baseline) {
    console.error(`[lint-ratchet] FAIL: eslint warnings increased ${baseline} -> ${warningCount} (+${warningCount - baseline}).`);
    console.error('Either fix the new warnings or, if intentional, run: pnpm lint:ratchet:update');
    process.exit(1);
}

if (warningCount < baseline) {
    console.log(`[lint-ratchet] OK: eslint warnings decreased ${baseline} -> ${warningCount} (-${baseline - warningCount}).`);
    console.log('Lower the baseline in the same commit: pnpm lint:ratchet:update');
    process.exit(0);
}

console.log(`[lint-ratchet] OK: eslint warnings unchanged at ${warningCount}.`);
process.exit(0);
