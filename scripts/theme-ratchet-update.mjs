#!/usr/bin/env node
// Raise `.theme-baseline` to the current adopted count from
// `.theme-coverage.json`. Run after a deliberate adoption increase
// (a template gained per-system `<system>:tw-*` variant usage).

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const SYSTEM_IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'];
const variantPattern = new RegExp(`\\b(${SYSTEM_IDS.join('|')}):tw-`);

const templatePaths = [...walkFiles('src/templates', { ext: '.hbs' })];
let current = 0;
const adoptedTemplates = [];
const perSystemHits = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 0]));

for (const path of templatePaths) {
    const text = readFileSync(path, 'utf8');
    if (!variantPattern.test(text)) continue;
    current++;
    adoptedTemplates.push(path);
    for (const id of SYSTEM_IDS) {
        const matches = text.match(new RegExp(`\\b${id}:tw-`, 'g'));
        if (matches) perSystemHits[id] += matches.length;
    }
}

writeFileSync('.theme-coverage.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: templatePaths.length,
    adopted: current,
    perSystemHits,
    adoptedTemplates,
}, null, 2) + '\n');
writeFileSync('.theme-baseline', `${current}\n`);
console.log(`.theme-baseline -> ${current}`);
