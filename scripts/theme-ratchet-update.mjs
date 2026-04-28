#!/usr/bin/env node
// Raise `.theme-baseline` to the current adopted count from
// `.theme-coverage.json`. Run after a deliberate adoption increase
// (a template gained per-system `<system>:tw-*` variant usage).

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('node scripts/theme-coverage.mjs', { stdio: 'pipe' });

const current = JSON.parse(readFileSync('.theme-coverage.json', 'utf8')).adopted;
writeFileSync('.theme-baseline', `${current}\n`);
console.log(`.theme-baseline -> ${current}`);
