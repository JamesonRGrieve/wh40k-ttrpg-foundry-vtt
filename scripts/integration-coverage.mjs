#!/usr/bin/env node
// Coverage report for Tier A integration tests. Counts the integration
// test files (one focused area per file) and the total `it(...)` /
// `test(...)` cases inside them. Output at `.integration-coverage.json`.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const ROOT = 'tests/integration';
const OUT = '.integration-coverage.json';

function* walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const stat = statSync(full);
        if (stat.isDirectory()) yield* walk(full);
        else if (stat.isFile() && name.endsWith('.test.ts')) yield full;
    }
}

const files = [...walk(ROOT)];
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
