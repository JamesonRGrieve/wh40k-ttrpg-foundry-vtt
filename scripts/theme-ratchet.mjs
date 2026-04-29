#!/usr/bin/env node
// Ratchet for per-system theme adoption (`<system>:tw-*` variants in
// templates). Direction: count cannot FALL. A drop means a regression
// (a template stopped supporting per-system theming).
//
// Reads `.theme-baseline` and `.theme-coverage.json` (regenerated here
// by running `pnpm theme:coverage`). Update via `pnpm theme:ratchet:update`
// after a deliberate increase in adoption.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const COVERAGE = '.theme-coverage.json';
const BASELINE = '.theme-baseline';

const SYSTEM_IDS = ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'];
const variantPattern = new RegExp(`\\b(${SYSTEM_IDS.join('|')}):tw-`);

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const stat = statSync(full);
        if (stat.isDirectory()) yield* walk(full);
        else if (stat.isFile() && name.endsWith('.hbs')) yield full;
    }
}

const templatePaths = [...walk('src/templates')];
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
