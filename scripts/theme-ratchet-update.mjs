#!/usr/bin/env node
// Raise `.theme-baseline` to the current adopted count from
// `.theme-coverage.json`. Run after a deliberate adoption increase
// (a template gained per-system `<system>:tw-*` variant usage). Scan lives in
// scripts/lib/scan-theme.mjs (shared with the coverage + ratchet scripts).

import { writeReport } from './lib/scan-theme.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const { adopted: current } = writeReport();
runScalarRatchet({
    baselinePath: '.theme-baseline',
    current,
    direction: 'fall',
    updateMode: true,
    updateMessage: (cur) => `.theme-baseline -> ${cur}`,
});
