#!/usr/bin/env node
/**
 * Type-check ratchet. Runs `tsc --noEmit` and compares the error count
 * to .tsc-error-baseline. Fails when the count goes UP, succeeds when
 * it goes down or stays the same. The baseline is committed to git;
 * once a PR lowers it, update the baseline file in the same commit.
 *
 * Usage:
 *   node scripts/typecheck-ratchet.mjs            # check
 *   node scripts/typecheck-ratchet.mjs --update   # rewrite baseline to current count
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE_PATH = resolve(process.cwd(), '.tsc-error-baseline');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

let tscOutput;
try {
    tscOutput = execSync('pnpm exec tsc --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
    tscOutput = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
}

const errorLines = tscOutput.split('\n').filter((line) => /error TS\d+/.test(line));
const current = errorLines.length;

if (updateMode) {
    writeFileSync(BASELINE_PATH, `${current}\n`, 'utf8');
    console.log(`[typecheck-ratchet] baseline updated to ${current}`);
    process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
    writeFileSync(BASELINE_PATH, `${current}\n`, 'utf8');
    console.log(`[typecheck-ratchet] baseline file missing — initialised at ${current}`);
    process.exit(0);
}

const baseline = parseInt(readFileSync(BASELINE_PATH, 'utf8').trim(), 10);
if (Number.isNaN(baseline)) {
    console.error(`[typecheck-ratchet] cannot parse baseline at ${BASELINE_PATH}`);
    process.exit(2);
}

if (current > baseline) {
    console.error(`[typecheck-ratchet] FAIL: tsc errors increased ${baseline} -> ${current} (+${current - baseline}).`);
    console.error('Either fix the new errors or, if intentional, run: pnpm typecheck:ratchet:update');
    process.exit(1);
}

if (current < baseline) {
    console.log(`[typecheck-ratchet] OK: tsc errors decreased ${baseline} -> ${current} (-${baseline - current}).`);
    console.log('Lower the baseline in the same commit: pnpm typecheck:ratchet:update');
    process.exit(0);
}

console.log(`[typecheck-ratchet] OK: tsc errors unchanged at ${current}.`);
process.exit(0);
