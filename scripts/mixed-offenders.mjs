#!/usr/bin/env node
/**
 * Diagnostic companion to scripts/css-coverage.mjs: for every template the
 * classifier calls `mixed`, list the exact class tokens that made it mixed.
 *
 * The coverage scanner answers "how many templates are still mixed"; this
 * answers "which token do I have to delete to fix this one". Reuses the
 * scanner's own classifier so the two never disagree.
 *
 * Usage:
 *   node scripts/mixed-offenders.mjs             # per-file offender lists
 *   node scripts/mixed-offenders.mjs --tokens    # global token frequency
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { walkFiles } from './lib/walk.mjs';
import { classifyFile, offendingTokens } from './lib/css-classify.mjs';

const ROOT = resolve(process.cwd(), 'src/templates');
const tokensMode = process.argv.includes('--tokens');

const perFile = [];
const freq = new Map();

for (const file of walkFiles(ROOT, { ext: '.hbs' })) {
    const src = readFileSync(file, 'utf8');
    if (classifyFile(src) !== 'mixed') continue;
    const bad = offendingTokens(src);
    perFile.push([relative(process.cwd(), file), bad]);
    for (const t of bad) freq.set(t, (freq.get(t) ?? 0) + 1);
}

if (tokensMode) {
    const rows = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [token, n] of rows) console.log(`${String(n).padStart(4)}  ${token}`);
    console.log(`\n${rows.length} distinct offending tokens across ${perFile.length} mixed templates.`);
} else {
    for (const [file, bad] of perFile) console.log(`${file}\n    ${bad.join(' ')}`);
    console.log(`\n${perFile.length} mixed templates.`);
}
