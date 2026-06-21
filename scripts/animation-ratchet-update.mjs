#!/usr/bin/env node
// Lower `.animation-baseline` to the current count from `.animation-coverage.json`.
// Run after a deliberate reduction (template port from monolith animation rule
// to `tw-animate-<name>`) to update the gate. Scan lives in
// scripts/lib/scan-animation.mjs (shared with the coverage + ratchet scripts).

import { writeReport } from './lib/scan-animation.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const { animationDeclarations: current } = writeReport();
runScalarRatchet({
    baselinePath: '.animation-baseline',
    current,
    direction: 'rise',
    updateMode: true,
    updateMessage: (cur) => `.animation-baseline -> ${cur}`,
});
