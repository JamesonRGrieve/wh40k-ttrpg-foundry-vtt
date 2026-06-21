// Single source for the `animation:` / `animation-name:` declaration scan.
//
// Counts the legacy CSS-monolith animation declarations across src/css/** (every
// file except the entry shim). The three animation scripts (coverage, ratchet,
// ratchet-update) consume count() + writeReport() so their scan + report shape
// stay identical. Output file: .animation-coverage.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './walk.mjs';

const COVERAGE_PATH = '.animation-coverage.json';
const DECLARATION_RE = /^\s*animation(?:-name)?\s*:/gm;

function listSources() {
    return [...walkFiles('src/css', { ext: '.css' })]
        .filter((p) => p !== 'src/css/entry.css')
        .sort();
}

/** Total `animation:` / `animation-name:` declarations across the sources. */
export function count() {
    let total = 0;
    for (const path of listSources()) {
        total += (readFileSync(path, 'utf8').match(DECLARATION_RE) ?? []).length;
    }
    return total;
}

/** Write .animation-coverage.json and return the report object. */
export function writeReport() {
    const sources = listSources();
    let animationDeclarations = 0;
    for (const path of sources) {
        animationDeclarations += (readFileSync(path, 'utf8').match(DECLARATION_RE) ?? []).length;
    }
    const report = {
        generatedAt: new Date().toISOString(),
        sources,
        animationDeclarations,
    };
    writeFileSync(COVERAGE_PATH, JSON.stringify(report, null, 2) + '\n');
    return report;
}
