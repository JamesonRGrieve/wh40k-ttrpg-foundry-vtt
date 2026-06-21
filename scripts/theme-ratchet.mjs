#!/usr/bin/env node
// Ratchet for per-system theme adoption (`<system>:tw-*` variants in
// templates). Direction: count cannot FALL. A drop means a regression
// (a template stopped supporting per-system theming).
//
// Reads `.theme-baseline` and `.theme-coverage.json` (regenerated here
// by running `pnpm theme:coverage`). Update via `pnpm theme:ratchet:update`
// after a deliberate increase in adoption.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const COVERAGE = '.theme-coverage.json';
const BASELINE = '.theme-baseline';

const SYSTEM_IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'];
const variantPattern = new RegExp(`\\b(${SYSTEM_IDS.join('|')}):tw-`);

const templatePaths = [...walkFiles('src/templates', { ext: '.hbs' })];
let current = 0;
const adoptedTemplates = [];
const perSystemHits = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 0]));

for (const path of templatePaths) {
    const text = readFileSync(path, 'utf8');
    if (!variantPattern.test(text)) continue;
    current++;
    adoptedTemplates.push(path);
    for (const id of SYSTEM_IDS) {
        const matches = text.match(new RegExp(`\\b${id}:tw-`, 'g'));
        if (matches) perSystemHits[id] += matches.length;
    }
}

writeFileSync(COVERAGE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: templatePaths.length,
    adopted: current,
    perSystemHits,
    adoptedTemplates,
}, null, 2) + '\n');

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
