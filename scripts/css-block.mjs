#!/usr/bin/env node
/**
 * Show or delete the rule block for an original source path inside the
 * monolithic src/css/wh40k-rpg.css.
 *
 * Reads .css-blocks.json (produced by scripts/css-block-index.mjs).
 * After a `delete`, the index is regenerated so subsequent calls see
 * the new line numbers.
 *
 * Usage:
 *   node scripts/css-block.mjs show <source-path>     # print the block to stdout
 *   node scripts/css-block.mjs delete <source-path>   # remove ALL ranges for this source
 *   node scripts/css-block.mjs list                   # list every source path in the index
 *
 * Source paths are matched as written in the monolith markers,
 * e.g. "src/css/item/_weapon.css".
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MONOLITH = resolve(process.cwd(), 'src/css/wh40k-rpg.css');
const INDEX = resolve(process.cwd(), '.css-blocks.json');

const [op, ...rest] = process.argv.slice(2);
if (!op || (op !== 'list' && rest.length === 0)) {
    console.error('Usage: css-block.mjs <show|delete|list> [source-path]');
    process.exit(2);
}

if (!existsSync(INDEX)) {
    console.error(`[css-block] missing ${INDEX} — run: pnpm css:block-index`);
    process.exit(2);
}

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const ranges = index.ranges;

if (op === 'list') {
    const keys = Object.keys(ranges).sort();
    for (const k of keys) {
        const total = ranges[k].reduce((s, r) => s + (r.end - r.start + 1), 0);
        console.log(`${k}\t${ranges[k].length} block(s)\t${total} line(s)`);
    }
    process.exit(0);
}

const target = rest[0];
const found = ranges[target];
if (!found) {
    console.error(`[css-block] no marker block for "${target}".`);
    console.error('Try: pnpm css:block list');
    process.exit(1);
}

const lines = readFileSync(MONOLITH, 'utf8').split('\n');

if (op === 'show') {
    for (const { start, end } of found) {
        process.stdout.write(`/* === block ${target} (lines ${start}-${end}) === */\n`);
        for (let i = start - 1; i <= end - 1 && i < lines.length; i++) {
            process.stdout.write(lines[i] + '\n');
        }
    }
    process.exit(0);
}

if (op === 'delete') {
    // Delete from highest range first so earlier line numbers remain valid.
    const sorted = [...found].sort((a, b) => b.start - a.start);
    let totalDeleted = 0;
    for (const { start, end } of sorted) {
        // splice in 0-based half-open coords: [start-1, end)
        lines.splice(start - 1, end - start + 1);
        totalDeleted += end - start + 1;
    }
    writeFileSync(MONOLITH, lines.join('\n'), 'utf8');
    console.log(`[css-block] deleted ${found.length} range(s) for "${target}", ${totalDeleted} line(s) total.`);

    // Regenerate the index so subsequent ops see the new line numbers.
    execSync('node scripts/css-block-index.mjs', { stdio: 'inherit' });
    process.exit(0);
}

console.error(`[css-block] unknown op "${op}"`);
process.exit(2);
