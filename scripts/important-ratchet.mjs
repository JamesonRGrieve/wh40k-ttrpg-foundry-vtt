#!/usr/bin/env node
// Ratchet for `!important` declarations remaining in `tailwind/*.js`.
//
// Reads `.important-baseline` and regenerates `.important-coverage.json` via
// the shared scan in scripts/lib/scan-important.mjs. Fails if the count has
// risen above the baseline. Run `pnpm important:ratchet:update` to lower the
// baseline after a port that removes !important declarations (typically:
// porting a template's consumption to inline `tw-*` utilities and deleting the
// matching plugin rule).

import { writeReport } from './lib/scan-important.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const BASELINE = '.important-baseline';

const { totalImportant: current } = writeReport();

runScalarRatchet({
    baselinePath: BASELINE,
    current,
    direction: 'rise',
    seedHint: `No ${BASELINE} found. Run \`pnpm important:ratchet:update\` once to seed it.`,
    failMessage: (cur, baseline) =>
        `important:ratchet failed — ${cur} \`!important\` declarations across tailwind/*.js, baseline is ${baseline}.\n` +
        `Each \`!important\` is a cascade workaround. Prefer porting the consumer template to inline \`tw-*\` utilities and removing the legacy rule.`,
    improveMessage: (cur, baseline) =>
        `important:ratchet — ${cur} \`!important\` declarations (was ${baseline}). Run \`pnpm important:ratchet:update\` to lower the baseline in this commit.`,
});
