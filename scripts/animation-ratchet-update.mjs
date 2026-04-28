#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('node scripts/animation-coverage.mjs', { stdio: 'pipe' });

const current = JSON.parse(readFileSync('.animation-coverage.json', 'utf8')).animationDeclarations;
writeFileSync('.animation-baseline', `${current}\n`);
console.log(`.animation-baseline -> ${current}`);
