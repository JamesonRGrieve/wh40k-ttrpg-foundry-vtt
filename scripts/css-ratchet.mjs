#!/usr/bin/env node
/**
 * CSS-coverage ratchet. Runs scripts/css-coverage.mjs (silently) and
 * compares the result to .css-coverage-baseline. Fails when the
 * tailwind-only count goes DOWN or the css-only count goes UP. Mixed
 * is allowed to fluctuate; the ratchet only enforces the two extremes.
 *
 * Pre-commit gate. Update via: pnpm css:ratchet:update.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT = resolve(process.cwd(), '.css-coverage.json');
const BASELINE = resolve(process.cwd(), '.css-coverage-baseline');
const args = process.argv.slice(2);
const updateMode = args.includes('--update');

execSync('node scripts/css-coverage.mjs --quiet', { stdio: 'inherit' });
const cur = JSON.parse(readFileSync(REPORT, 'utf8')).summary;

const cmpKeys = ['tailwind-only', 'mixed', 'css-only', 'total'];
const baselinePayload = JSON.stringify(
    Object.fromEntries(cmpKeys.map((k) => [k, cur[k]])),
    null,
    2,
);

if (updateMode) {
    writeFileSync(BASELINE, baselinePayload + '\n', 'utf8');
    console.log(
        `[css-ratchet] baseline updated: tw-only=${cur['tailwind-only']} mixed=${cur.mixed} css-only=${cur['css-only']}`,
    );
    process.exit(0);
}

if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, baselinePayload + '\n', 'utf8');
    console.log(
        `[css-ratchet] baseline file missing — initialised: tw-only=${cur['tailwind-only']} mixed=${cur.mixed} css-only=${cur['css-only']}`,
    );
    process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

const failures = [];
if (cur['tailwind-only'] < base['tailwind-only']) {
    failures.push(`tailwind-only ${base['tailwind-only']} -> ${cur['tailwind-only']} (-${base['tailwind-only'] - cur['tailwind-only']})`);
}
if (cur['css-only'] > base['css-only']) {
    failures.push(`css-only ${base['css-only']} -> ${cur['css-only']} (+${cur['css-only'] - base['css-only']})`);
}

if (failures.length) {
    console.error('[css-ratchet] FAIL:');
    for (const f of failures) console.error('  ' + f);
    console.error('Either restore Tailwind coverage or, if intentional, run: pnpm css:ratchet:update');
    process.exit(1);
}

const improved =
    cur['tailwind-only'] > base['tailwind-only'] || cur['css-only'] < base['css-only'];
if (improved) {
    console.log(
        `[css-ratchet] OK: tw-only ${base['tailwind-only']} -> ${cur['tailwind-only']}, ` +
            `css-only ${base['css-only']} -> ${cur['css-only']}. ` +
            `Lower the baseline in the same commit: pnpm css:ratchet:update`,
    );
    process.exit(0);
}

console.log(
    `[css-ratchet] OK: tw-only=${cur['tailwind-only']} mixed=${cur.mixed} css-only=${cur['css-only']} (unchanged).`,
);
process.exit(0);
