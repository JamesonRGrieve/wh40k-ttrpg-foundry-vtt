// Single source for the per-system theme-adoption scan.
//
// A template is "per-system aware" if it contains at least one `<id>:tw-` class
// token for one of the seven system variants. The three theme scripts
// (coverage, ratchet, ratchet-update) consume count() + writeReport() so their
// scan, enumeration, and report shape stay identical — previously the coverage
// script enumerated templates with `find` while the ratchet used an inline
// walk, so their reports could disagree on ordering. Both now use the shared
// walkFiles enumeration. Output file: .theme-coverage.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './walk.mjs';
import { SYSTEM_IDS } from './system-ids.mjs';

const COVERAGE_PATH = '.theme-coverage.json';
const variantPattern = new RegExp(`\\b(${SYSTEM_IDS.join('|')}):tw-`);

function listTemplates() {
    return [...walkFiles('src/templates', { ext: '.hbs' })];
}

function tally() {
    const templatePaths = listTemplates();
    let adopted = 0;
    const adoptedTemplates = [];
    const perSystemHits = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 0]));

    for (const path of templatePaths) {
        const text = readFileSync(path, 'utf8');
        if (!variantPattern.test(text)) continue;
        adopted++;
        adoptedTemplates.push(path);
        for (const id of SYSTEM_IDS) {
            const matches = text.match(new RegExp(`\\b${id}:tw-`, 'g'));
            if (matches) perSystemHits[id] += matches.length;
        }
    }

    return { total: templatePaths.length, adopted, perSystemHits, adoptedTemplates };
}

/** Number of per-system-aware templates (the ratcheted value). */
export function count() {
    return tally().adopted;
}

/** Write .theme-coverage.json and return the report object. */
export function writeReport() {
    const { total, adopted, perSystemHits, adoptedTemplates } = tally();
    const report = {
        generatedAt: new Date().toISOString(),
        total,
        adopted,
        perSystemHits,
        adoptedTemplates,
    };
    writeFileSync(COVERAGE_PATH, JSON.stringify(report, null, 2) + '\n');
    return report;
}
