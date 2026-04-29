#!/usr/bin/env node
// Ratchet for `animation:` declarations remaining in the CSS monolith.
//
// Reads `.animation-baseline` and `.animation-coverage.json` (regenerated
// by `pnpm animation:coverage`). Fails if the count has risen above the
// baseline. Run `pnpm animation:ratchet:update` to lower the baseline after
// genuine reductions.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const COVERAGE = '.animation-coverage.json';
const BASELINE = '.animation-baseline';

const MONOLITH = 'src/css/wh40k-rpg.css';
const text = readFileSync(MONOLITH, 'utf8');
const current = (text.match(/^\s*animation(?:-name)?\s*:/gm) ?? []).length;
writeFileSync(COVERAGE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    monolith: MONOLITH,
    animationDeclarations: current,
}, null, 2) + '\n');

if (!existsSync(BASELINE)) {
    console.error(`No ${BASELINE} found. Run \`pnpm animation:ratchet:update\` once to seed it.`);
    process.exit(2);
}

const baseline = Number(readFileSync(BASELINE, 'utf8').trim());

if (Number.isNaN(baseline)) {
    console.error(`${BASELINE} is not a number.`);
    process.exit(2);
}

if (current > baseline) {
    console.error(
        `animation:ratchet failed — ${current} animation declarations in ${COVERAGE.replace(/\.json$/, '')}, baseline is ${baseline}.\n` +
        `Each \`animation: <name> ...\` rule in the monolith should be replaced by \`tw-animate-<name>\` on the consuming template (\`docs/tailwind-migration.md\`).`,
    );
    process.exit(1);
}

if (current < baseline) {
    console.log(
        `animation:ratchet — ${current} animation declarations (was ${baseline}). Run \`pnpm animation:ratchet:update\` to lower the baseline in this commit.`,
    );
}

process.exit(0);
