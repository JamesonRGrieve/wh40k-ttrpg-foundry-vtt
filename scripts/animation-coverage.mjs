#!/usr/bin/env node
// Count remaining `animation:` declarations in the CSS monolith.
//
// Each declaration is a rule that fires a keyframe via the cascade — these
// are what we want to migrate to `tw-animate-<name>` on the consuming template.
// Once the count reaches 0, the @keyframes safelist in tailwind.config.js
// can be removed.
//
// Output: prints the count to stdout. Writes `.animation-coverage.json` for
// the ratchet to compare against `.animation-baseline`. The scan itself lives
// in scripts/lib/scan-animation.mjs (shared with the ratchet + update scripts).

import { writeReport } from './lib/scan-animation.mjs';

const { animationDeclarations } = writeReport();
console.log(animationDeclarations);
