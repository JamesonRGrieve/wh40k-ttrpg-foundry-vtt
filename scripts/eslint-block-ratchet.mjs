#!/usr/bin/env node
// Block eslint-disable ratchet (#719).
//
// Over the lint surface (src/module, src/templates, stories, tests):
//   - a block `/* eslint-disable */` with no `/* eslint-enable */` after it
//     is a HARD FAIL (it disables the rule to end of file);
//   - the number of lines inside blocks may only fall:
//       increase -> commit blocked
//       decrease -> baseline auto-lowers and is staged
//       missing  -> baseline self-initialises
//
// Flags: --update (force baseline to current), --list (per-file coverage).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanBlocks } from './lib/eslint-blocks.mjs';
import { walkFiles } from './lib/walk.mjs';

const ROOT = process.cwd();
const BASELINE = join(ROOT, '.eslint-block-baseline');
const DIRS = ['src/module', 'src/templates', 'stories', 'tests'];
const EXT = ['.ts', '.mts', '.js', '.mjs'];

let covered = 0;
const perFile = [];
const unclosed = [];
for (const dir of DIRS) {
    for (const file of walkFiles(join(ROOT, dir), { ext: EXT })) {
        const rel = file.slice(ROOT.length + 1);
        const result = scanBlocks(readFileSync(file, 'utf8'));
        if (result.covered > 0) perFile.push([result.covered, rel]);
        if (result.unclosed !== null) unclosed.push(`${rel}:${result.unclosed}`);
        covered += result.covered;
    }
}
perFile.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));

if (process.argv.includes('--list')) {
    console.log(`lines inside block eslint-disables: ${covered} in ${perFile.length} files`);
    for (const [n, f] of perFile) console.log(`  ${String(n).padStart(5)}  ${f}`);
    process.exit(unclosed.length > 0 ? 1 : 0);
}

if (unclosed.length > 0) {
    console.error('[eslint-block] FAIL: block eslint-disable with no eslint-enable (runs to end of file):');
    for (const u of unclosed) console.error('  ' + u);
    console.error('Close the block, or replace it with eslint-disable-next-line on the lines that need it.');
    process.exit(1);
}

const save = (n) => writeFileSync(BASELINE, JSON.stringify({ covered: n }, null, 2) + '\n');
const stage = () => {
    try {
        execFileSync('git', ['add', BASELINE], { stdio: 'ignore' });
    } catch {
        /* not a git context — fine */
    }
};

if (process.argv.includes('--update') || !existsSync(BASELINE)) {
    save(covered);
    stage();
    console.log(`[eslint-block] baseline set to ${covered}`);
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).covered;
if (covered > baseline) {
    console.error(`[eslint-block] FAIL: block eslint-disables cover ${covered} lines, baseline ${baseline}. The count may only fall.`);
    for (const [n, f] of perFile.slice(0, 15)) console.error(`  ${String(n).padStart(5)}  ${f}`);
    process.exit(1);
}
if (covered < baseline) {
    save(covered);
    stage();
    console.log(`[eslint-block] ratcheted down ${baseline} -> ${covered}`);
    process.exit(0);
}
console.log(`[eslint-block] OK (${covered} lines, baseline ${baseline})`);
