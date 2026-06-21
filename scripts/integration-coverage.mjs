#!/usr/bin/env node
// Coverage report for Tier A integration tests. Counts the integration
// test files (one focused area per file) and the total `it(...)` /
// `test(...)` cases inside them. Output at `.integration-coverage.json`.

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const ROOT = 'tests/integration';
const OUT = '.integration-coverage.json';

const files = [...walkFiles(ROOT, { ext: '.test.ts' })];
let cases = 0;
const perFile = [];
const caseRe = /^\s*(?:it|test)(?:\.\w+)?\s*\(/gm;

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const matches = text.match(caseRe) ?? [];
    cases += matches.length;
    perFile.push({ file, cases: matches.length });
}

const report = {
    generatedAt: new Date().toISOString(),
    files: files.length,
    cases,
    perFile,
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`integration:coverage — ${files.length} files, ${cases} cases — ${OUT}`);
