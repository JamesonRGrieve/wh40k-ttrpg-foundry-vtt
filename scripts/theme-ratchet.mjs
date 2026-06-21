#!/usr/bin/env node
// Ratchet for per-system theme adoption (`<system>:tw-*` variants in
// templates). Direction: count cannot FALL. A drop means a regression
// (a template stopped supporting per-system theming).
//
// Reads `.theme-baseline` and regenerates `.theme-coverage.json` via the shared
// scan in scripts/lib/scan-theme.mjs. Update via `pnpm theme:ratchet:update`
// after a deliberate increase in adoption.

import { existsSync, readFileSync } from 'node:fs';
import { writeReport } from './lib/scan-theme.mjs';

const BASELINE = '.theme-baseline';

const { adopted: current } = writeReport();

if (!existsSync(BASELINE)) {
    console.error(`No ${BASELINE} found. Run \`pnpm theme:ratchet:update\` once to seed it.`);
    process.exit(2);
}

const baseline = Number(readFileSync(BASELINE, 'utf8').trim());

if (Number.isNaN(baseline)) {
    console.error(`${BASELINE} is not a number.`);
    process.exit(2);
}

if (current < baseline) {
    console.error(
        `theme:ratchet failed — ${current} per-system-aware templates, baseline is ${baseline}.\n` +
        'A template lost its per-system theming. Add <system>:tw-* variants back, or run `pnpm theme:ratchet:update` if the drop is intentional (rare).',
    );
    process.exit(1);
}

if (current > baseline) {
    console.log(
        `theme:ratchet — ${current} per-system-aware templates (was ${baseline}). Run \`pnpm theme:ratchet:update\` to lock the gain in this commit.`,
    );
}

process.exit(0);
