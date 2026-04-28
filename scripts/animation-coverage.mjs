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

import { readFileSync, writeFileSync } from 'node:fs';

const MONOLITH = 'src/css/wh40k-rpg.css';

const text = readFileSync(MONOLITH, 'utf8');
// Match `animation:` and `animation-name:` declarations (skip `animation-duration`,
// `animation-iteration-count`, etc. — those don't reference a keyframe by name).
const matches = text.match(/^\s*animation(?:-name)?\s*:/gm) ?? [];
const count = matches.length;

const report = {
    generatedAt: new Date().toISOString(),
    monolith: MONOLITH,
    animationDeclarations: count,
};

writeFileSync('.animation-coverage.json', JSON.stringify(report, null, 2) + '\n');
console.log(count);
