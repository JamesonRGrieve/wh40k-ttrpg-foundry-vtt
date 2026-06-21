#!/usr/bin/env node
// Count remaining `!important` declarations across the legacy plugin files
// in `tailwind/*.js`. Each occurrence is migration debt — a rule strong-arming
// its way past the cascade because the surrounding scope hasn't been ported
// to inline `tw-*` utilities on the consuming template yet.
//
// Output: prints the total to stdout, writes `.important-coverage.json` for
// the ratchet to compare against `.important-baseline`. The scan lives in
// scripts/lib/scan-important.mjs (shared with the ratchet + update scripts).

import { writeReport } from './lib/scan-important.mjs';

const { totalImportant } = writeReport();
console.log(totalImportant);
