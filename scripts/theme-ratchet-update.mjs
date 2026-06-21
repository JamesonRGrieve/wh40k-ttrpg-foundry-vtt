#!/usr/bin/env node
// Raise `.theme-baseline` to the current adopted count from
// `.theme-coverage.json`. Run after a deliberate adoption increase
// (a template gained per-system `<system>:tw-*` variant usage). Scan lives in
// scripts/lib/scan-theme.mjs (shared with the coverage + ratchet scripts).

import { writeFileSync } from 'node:fs';
import { writeReport } from './lib/scan-theme.mjs';

const { adopted: current } = writeReport();
writeFileSync('.theme-baseline', `${current}\n`);
console.log(`.theme-baseline -> ${current}`);
