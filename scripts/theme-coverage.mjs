#!/usr/bin/env node
// Count templates that use per-system theme variants.
//
// A template is "per-system aware" if it contains at least one class token
// using one of the 7 system variants (`bc:`, `dh1:`, `dh2:`, `dw:`, `ow:`,
// `rt:`, `im:`) followed by `tw-`. Each variant maps to
// `[data-wh40k-system="<id>"] &` in tailwind.config.js.
//
// Direction: this number rises as templates adopt per-system styling.
// The ratchet asserts it cannot fall.
//
// Output: prints `<adopted>/<total>` to stdout. Writes `.theme-coverage.json`
// with full breakdown. The scan (and the canonical system-id list) lives in
// scripts/lib/scan-theme.mjs, shared with the ratchet + update scripts.

import { writeReport } from './lib/scan-theme.mjs';

const { adopted, total } = writeReport();
console.log(`${adopted}/${total}`);
