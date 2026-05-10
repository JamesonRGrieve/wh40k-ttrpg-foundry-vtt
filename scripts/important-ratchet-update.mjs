#!/usr/bin/env node
// Lower `.important-baseline` to the current count from
// `.important-coverage.json`. Run after a deliberate reduction (template
// port that removes one or more `!important` declarations from
// tailwind/*.js).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = readdirSync('tailwind')
    .filter((f) => f.endsWith('.js'))
    .map((f) => join('tailwind', f))
    .sort();

const perFile = {};
let current = 0;
for (const path of SOURCES) {
    const text = readFileSync(path, 'utf8');
    const count = (text.match(/!important/g) ?? []).length;
    perFile[path] = count;
    current += count;
}

writeFileSync(
    '.important-coverage.json',
    JSON.stringify(
        { generatedAt: new Date().toISOString(), sources: SOURCES, perFile, totalImportant: current },
        null,
        2,
    ) + '\n',
);
writeFileSync('.important-baseline', `${current}\n`);
console.log(`.important-baseline -> ${current}`);
