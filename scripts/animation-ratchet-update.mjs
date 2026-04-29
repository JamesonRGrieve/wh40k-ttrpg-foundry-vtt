#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate.

import { readFileSync, writeFileSync } from 'node:fs';

const MONOLITH = 'src/css/wh40k-rpg.css';
const text = readFileSync(MONOLITH, 'utf8');
const current = (text.match(/^\s*animation(?:-name)?\s*:/gm) ?? []).length;
writeFileSync('.animation-coverage.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    monolith: MONOLITH,
    animationDeclarations: current,
}, null, 2) + '\n');
writeFileSync('.animation-baseline', `${current}\n`);
console.log(`.animation-baseline -> ${current}`);
