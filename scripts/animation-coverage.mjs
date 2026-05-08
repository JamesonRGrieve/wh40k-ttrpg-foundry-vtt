#!/usr/bin/env node
// Count remaining `animation:` declarations in the CSS monolith.
//
// Each declaration is a rule that fires a keyframe via the cascade — these
// are what we want to migrate to `tw-animate-<name>` on the consuming template.
// Once the count reaches 0, the @keyframes safelist in tailwind.config.js
// can be removed.
//
// Output: prints the count to stdout. Writes `.animation-coverage.json` for
// the ratchet to compare against `.animation-baseline`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The legacy monolith was exploded into per-component files under src/css/**.
// Scan every legacy CSS file (everything except the entry shim) for
// `animation:` and `animation-name:` declarations.
function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.css')) out.push(full);
    }
    return out;
}
const SOURCES = walk('src/css').filter((p) => p !== 'src/css/entry.css').sort();

let count = 0;
for (const path of SOURCES) {
    const text = readFileSync(path, 'utf8');
    const matches = text.match(/^\s*animation(?:-name)?\s*:/gm) ?? [];
    count += matches.length;
}

const report = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    animationDeclarations: count,
};

writeFileSync('.animation-coverage.json', JSON.stringify(report, null, 2) + '\n');
console.log(count);
