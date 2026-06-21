#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate.

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const SOURCES = [...walkFiles('src/css', { ext: '.css' })]
    .filter((p) => p !== 'src/css/entry.css')
    .sort();

let current = 0;
for (const path of SOURCES) {
    const text = readFileSync(path, 'utf8');
    current += (text.match(/^\s*animation(?:-name)?\s*:/gm) ?? []).length;
}
writeFileSync('.animation-coverage.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    animationDeclarations: current,
}, null, 2) + '\n');
writeFileSync('.animation-baseline', `${current}\n`);
console.log(`.animation-baseline -> ${current}`);
