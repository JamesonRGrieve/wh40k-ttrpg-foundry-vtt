#!/usr/bin/env node
/**
 * Report, and set aside, the Tier B captures a full run did not write (#700).
 *
 * `.e2e-screenshots/` is never cleared, so a capture whose spec was removed or
 * renamed stays beside the current ones and passes for evidence in a screenshot
 * audit: 39 such orphans, some months old, misled the 0.2.0 freeze audit. After a
 * successful FULL run, every `game__*.png` not modified since the run started is
 * stale. It is moved into `.e2e-screenshots/_stale-<timestamp>/` (git-ignored,
 * nothing deleted) and listed, so the folder holds only this run's captures.
 *
 * usage: node scripts/e2e-stale-captures.mjs <run-start marker file> [captures dir]
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[3] ?? join(ROOT, '.e2e-screenshots');
const CAPTURE = /^game__.+\.png$/;

const marker = process.argv[2];
if (marker === undefined || !existsSync(marker)) {
    console.error('[e2e-stale-captures] no run-start marker given; nothing checked');
    process.exit(0);
}
if (!existsSync(SHOTS)) process.exit(0);

const runStart = statSync(marker).mtimeMs;
const stale = readdirSync(SHOTS)
    .filter((name) => CAPTURE.test(name))
    .filter((name) => statSync(join(SHOTS, name)).mtimeMs < runStart)
    .sort();

if (stale.length === 0) {
    console.log('[e2e-stale-captures] every capture was written by this run');
    process.exit(0);
}
const dest = join(SHOTS, `_stale-${new Date(runStart).toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(dest, { recursive: true });
for (const name of stale) renameSync(join(SHOTS, name), join(dest, name));
console.log(`[e2e-stale-captures] ${stale.length} capture(s) no spec wrote this run, moved to ${dest}:`);
for (const name of stale) console.log(`  ${name}`);
