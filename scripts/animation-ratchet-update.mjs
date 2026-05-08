#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.css')) out.push(full);
    }
    return out;
}
const SOURCES = walk('src/css').filter((p) => p !== 'src/css/entry.css').sort();

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
