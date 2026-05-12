#!/usr/bin/env node
/**
 * TS-error coverage for an arbitrary tsconfig (default: tsconfig.strict.json).
 *
 * Runs `tsc --noEmit -p <config>` and tallies errors per TS error code. Used
 * by the strict-ratchet and the test-typecheck-ratchet — each enables a set of
 * "next-tier" strictness flags or test/story compilation that the main
 * tsconfig cannot enable today without crashing the hard typecheck gate.
 *
 * The companion ratchet (strict-ratchet.mjs) enforces:
 *   - per-code counts only go DOWN
 *   - when any code's count reaches 0, it auto-flips to "strict mode": any
 *     future occurrence is a hard fail.
 *
 * Usage:
 *   node scripts/strict-coverage.mjs                                       # strict tsconfig
 *   node scripts/strict-coverage.mjs --config tsconfig.test.json --out .test-typecheck-coverage.json
 *   node scripts/strict-coverage.mjs --json                                # stdout-only JSON
 *   node scripts/strict-coverage.mjs --quiet                               # report, no stdout
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
function arg(name, fallback) {
    const i = argv.indexOf(name);
    if (i === -1) return fallback;
    return argv[i + 1];
}

const config = arg('--config', 'tsconfig.strict.json');
const out = arg('--out', '.strict-coverage.json');
const jsonOnly = argv.includes('--json');
const quiet = argv.includes('--quiet');

const CONFIG_PATH = resolve(process.cwd(), config);
const OUT_PATH = resolve(process.cwd(), out);

if (!existsSync(CONFIG_PATH)) {
    console.error(`[strict-coverage] missing ${CONFIG_PATH}`);
    process.exit(2);
}

// tsc exits non-zero whenever there are errors. We want the error list, so
// catch and read stdout.
let tscOutput = '';
try {
    tscOutput = execSync(`./node_modules/.bin/tsc --noEmit -p ${config}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 128 * 1024 * 1024,
    });
} catch (err) {
    tscOutput = err.stdout?.toString() ?? '';
}

// tsc lines look like: `path/to/file.ts(123,45): error TS4114: <message>`
const LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+TS(\d+):\s+(.*)$/;

const byCode = {};
const byFile = {};
let totalErrors = 0;

for (const line of tscOutput.split('\n')) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, file, , , codeNum] = m;
    const code = `TS${codeNum}`;
    byCode[code] = (byCode[code] ?? 0) + 1;
    byFile[file] ??= {};
    byFile[file][code] = (byFile[file][code] ?? 0) + 1;
    totalErrors++;
}

const payload = {
    generatedAt: new Date().toISOString(),
    config,
    summary: { totalErrors, codes: Object.keys(byCode).length },
    byCode,
    byFile,
};
const serialized = JSON.stringify(payload, null, 2) + '\n';

if (!jsonOnly) writeFileSync(OUT_PATH, serialized, 'utf8');

if (jsonOnly) {
    process.stdout.write(serialized);
    process.exit(0);
}

if (quiet) process.exit(0);

const sortedCodes = Object.entries(byCode).sort((a, b) => b[1] - a[1]);
console.log(`\n[strict-coverage] ${totalErrors} errors under ${config}`);
console.log('');
console.log('| code | count |');
console.log('| --- | ---: |');
for (const [code, count] of sortedCodes) {
    console.log(`| ${code} | ${count} |`);
}
console.log('');
console.log(`Report written to ${OUT_PATH}.`);
