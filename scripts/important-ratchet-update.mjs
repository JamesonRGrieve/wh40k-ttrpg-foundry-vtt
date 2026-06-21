#!/usr/bin/env node
// Lower `.important-baseline` to the current count from
// `.important-coverage.json`. Run after a deliberate reduction (template
// port that removes one or more `!important` declarations from
// tailwind/*.js). Scan lives in scripts/lib/scan-important.mjs (shared with the
// coverage + ratchet scripts).

import { writeFileSync } from 'node:fs';
import { writeReport } from './lib/scan-important.mjs';

const { totalImportant: current } = writeReport();
writeFileSync('.important-baseline', `${current}\n`);
console.log(`.important-baseline -> ${current}`);
