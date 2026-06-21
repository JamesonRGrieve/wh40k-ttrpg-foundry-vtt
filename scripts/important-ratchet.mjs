#!/usr/bin/env node
// Ratchet for `!important` declarations remaining in `tailwind/*.js`.
//
// Reads `.important-baseline` and regenerates `.important-coverage.json` via
// the shared scan in scripts/lib/scan-important.mjs. Fails if the count has
// risen above the baseline. Run `pnpm important:ratchet:update` to lower the
// baseline after a port that removes !important declarations (typically:
// porting a template's consumption to inline `tw-*` utilities and deleting the
// matching plugin rule).

import { existsSync, readFileSync } from 'node:fs';
import { writeReport } from './lib/scan-important.mjs';

const BASELINE = '.important-baseline';

const { totalImportant: current } = writeReport();

if (!existsSync(BASELINE)) {
    console.error(`No ${BASELINE} found. Run \`pnpm important:ratchet:update\` once to seed it.`);
    process.exit(2);
}

const baseline = Number(readFileSync(BASELINE, 'utf8').trim());
if (Number.isNaN(baseline)) {
    console.error(`${BASELINE} is not a number.`);
    process.exit(2);
}

if (current > baseline) {
    console.error(
        `important:ratchet failed — ${current} \`!important\` declarations across tailwind/*.js, baseline is ${baseline}.\n` +
            `Each \`!important\` is a cascade workaround. Prefer porting the consumer template to inline \`tw-*\` utilities and removing the legacy rule.`,
    );
    process.exit(1);
}

if (current < baseline) {
    console.log(
        `important:ratchet — ${current} \`!important\` declarations (was ${baseline}). Run \`pnpm important:ratchet:update\` to lower the baseline in this commit.`,
    );
}

process.exit(0);
