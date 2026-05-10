#!/usr/bin/env node
// Count remaining `!important` declarations across the legacy plugin files
// in `tailwind/*.js`. Each occurrence is migration debt — a rule strong-arming
// its way past the cascade because the surrounding scope hasn't been ported
// to inline `tw-*` utilities on the consuming template yet.
//
// Output: prints the total to stdout, writes `.important-coverage.json` for
// the ratchet to compare against `.important-baseline`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function listPluginFiles() {
    return readdirSync('tailwind')
        .filter((f) => f.endsWith('.js'))
        .map((f) => join('tailwind', f))
        .sort();
}

const SOURCES = listPluginFiles();
const perFile = {};
let total = 0;
for (const path of SOURCES) {
    const text = readFileSync(path, 'utf8');
    const count = (text.match(/!important/g) ?? []).length;
    perFile[path] = count;
    total += count;
}

const report = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    perFile,
    totalImportant: total,
};

writeFileSync('.important-coverage.json', JSON.stringify(report, null, 2) + '\n');
console.log(total);
