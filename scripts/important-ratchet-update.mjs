#!/usr/bin/env node
// Lower `.important-baseline` to the current count from
// `.important-coverage.json`. Run after a deliberate reduction (template
// port that removes one or more `!important` declarations from
// tailwind/*.js). Scan lives in scripts/lib/scan-important.mjs (shared with the
// coverage + ratchet scripts).

import { writeReport } from './lib/scan-important.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const { totalImportant: current } = writeReport();
runScalarRatchet({
    baselinePath: '.important-baseline',
    current,
    direction: 'rise',
    updateMode: true,
    updateMessage: (cur) => `.important-baseline -> ${cur}`,
});
