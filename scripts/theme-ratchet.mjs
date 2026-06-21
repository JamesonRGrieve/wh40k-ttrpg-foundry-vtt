#!/usr/bin/env node
// Ratchet for per-system theme adoption (`<system>:tw-*` variants in
// templates). Direction: count cannot FALL. A drop means a regression
// (a template stopped supporting per-system theming).
//
// Reads `.theme-baseline` and regenerates `.theme-coverage.json` via the shared
// scan in scripts/lib/scan-theme.mjs. Update via `pnpm theme:ratchet:update`
// after a deliberate increase in adoption.

import { writeReport } from './lib/scan-theme.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const BASELINE = '.theme-baseline';

const { adopted: current } = writeReport();

runScalarRatchet({
    baselinePath: BASELINE,
    current,
    direction: 'fall',
    seedHint: `No ${BASELINE} found. Run \`pnpm theme:ratchet:update\` once to seed it.`,
    failMessage: (cur, baseline) =>
        `theme:ratchet failed — ${cur} per-system-aware templates, baseline is ${baseline}.\n` +
        'A template lost its per-system theming. Add <system>:tw-* variants back, or run `pnpm theme:ratchet:update` if the drop is intentional (rare).',
    improveMessage: (cur, baseline) =>
        `theme:ratchet — ${cur} per-system-aware templates (was ${baseline}). Run \`pnpm theme:ratchet:update\` to lock the gain in this commit.`,
});
