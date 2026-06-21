#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate. Scan lives in
// scripts/lib/scan-animation.mjs (shared with the coverage + ratchet scripts).

import { writeFileSync } from 'node:fs';
import { writeReport } from './lib/scan-animation.mjs';

const { animationDeclarations: current } = writeReport();
writeFileSync('.animation-baseline', `${current}\n`);
console.log(`.animation-baseline -> ${current}`);
