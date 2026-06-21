// Single source for the `!important` declaration scan across tailwind/*.js.
//
// Each `!important` is a cascade workaround in a legacy plugin file — migration
// debt to remove as consumers move to inline tw-* utilities. The three
// important scripts (coverage, ratchet, ratchet-update) consume count() +
// writeReport() so their scan + report shape stay identical.
// Output file: .important-coverage.json.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COVERAGE_PATH = '.important-coverage.json';
const IMPORTANT_RE = /!important/g;

function listSources() {
    return readdirSync('tailwind')
        .filter((f) => f.endsWith('.js'))
        .map((f) => join('tailwind', f))
        .sort();
}

function tally() {
    const sources = listSources();
    const perFile = {};
    let total = 0;
    for (const path of sources) {
        const c = (readFileSync(path, 'utf8').match(IMPORTANT_RE) ?? []).length;
        perFile[path] = c;
        total += c;
    }
    return { sources, perFile, total };
}

/** Total `!important` declarations across tailwind/*.js. */
export function count() {
    return tally().total;
}

/** Write .important-coverage.json and return the report object. */
export function writeReport() {
    const { sources, perFile, total } = tally();
    const report = {
        generatedAt: new Date().toISOString(),
        sources,
        perFile,
        totalImportant: total,
    };
    writeFileSync(COVERAGE_PATH, JSON.stringify(report, null, 2) + '\n');
    return report;
}
