#!/usr/bin/env node
// Ratchet for `animation:` declarations remaining in the CSS monolith.
//
// Reads `.animation-baseline` and `.animation-coverage.json` (regenerated
// here via the shared scan in scripts/lib/scan-animation.mjs). Fails if the
// count has risen above the baseline. Run `pnpm animation:ratchet:update` to
// lower the baseline after genuine reductions.

import { writeReport } from './lib/scan-animation.mjs';
import { runScalarRatchet } from './lib/scalar-ratchet.mjs';

const COVERAGE = '.animation-coverage.json';
const BASELINE = '.animation-baseline';

const { animationDeclarations: current } = writeReport();

runScalarRatchet({
    baselinePath: BASELINE,
    current,
    direction: 'rise',
    seedHint: `No ${BASELINE} found. Run \`pnpm animation:ratchet:update\` once to seed it.`,
    failMessage: (cur, baseline) =>
        `animation:ratchet failed — ${cur} animation declarations in ${COVERAGE.replace(/\.json$/, '')}, baseline is ${baseline}.\n` +
        `Each \`animation: <name> ...\` rule in the monolith should be replaced by \`tw-animate-<name>\` on the consuming template (\`docs/tailwind-migration.md\`).`,
    improveMessage: (cur, baseline) =>
        `animation:ratchet — ${cur} animation declarations (was ${baseline}). Run \`pnpm animation:ratchet:update\` to lower the baseline in this commit.`,
});
