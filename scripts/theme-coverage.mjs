#!/usr/bin/env node
// Count templates that use per-system theme variants.
//
// A template is "per-system aware" if it contains at least one class token
// using one of the 7 system variants (`bc:`, `dh1e:`, `dh2e:`, `dw:`, `ow:`,
// `rt:`, `im:`) followed by `tw-`. Each variant maps to
// `[data-wh40k-system="<id>"] &` in tailwind.config.js.
//
// Direction: this number rises as templates adopt per-system styling.
// The ratchet asserts it cannot fall.
//
// Output: prints `<adopted>/<total>` to stdout. Writes
// `.theme-coverage.json` with full breakdown.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SYSTEM_IDS = ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'];
const variantPattern = new RegExp(
    `\\b(${SYSTEM_IDS.join('|')}):tw-`,
);

const templatePaths = execSync('find src/templates -type f -name "*.hbs"', {
    encoding: 'utf8',
}).trim().split('\n').filter(Boolean);

let adopted = 0;
const adoptedTemplates = [];
const perSystemHits = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 0]));

for (const path of templatePaths) {
    const text = readFileSync(path, 'utf8');
    if (!variantPattern.test(text)) continue;
    adopted++;
    adoptedTemplates.push(path);
    for (const id of SYSTEM_IDS) {
        const re = new RegExp(`\\b${id}:tw-`, 'g');
        const matches = text.match(re);
        if (matches) perSystemHits[id] += matches.length;
    }
}

const report = {
    generatedAt: new Date().toISOString(),
    total: templatePaths.length,
    adopted,
    perSystemHits,
    adoptedTemplates,
};

writeFileSync('.theme-coverage.json', JSON.stringify(report, null, 2) + '\n');
console.log(`${adopted}/${templatePaths.length}`);
