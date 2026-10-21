// Single source for the per-system theme-adoption scan.
//
// A template is "per-system aware" if it carries per-system theming itself or
// renders a partial that does (theme-awareness.mjs). The three theme scripts
// (coverage, ratchet, ratchet-update) consume count() + writeReport() so their
// scan, enumeration, and report shape stay identical — previously the coverage
// script enumerated templates with `find` while the ratchet used an inline
// walk, so their reports could disagree on ordering. Both now use the shared
// walkFiles enumeration. Output file: .theme-coverage.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './walk.mjs';
import { SYSTEM_IDS } from './system-ids.mjs';
import { classifyThemeAwareness } from './theme-awareness.mjs';

const COVERAGE_PATH = '.theme-coverage.json';
// A template counts as adopted when it carries per-system theming itself — an
// `<id>:tw-*` variant, or a `themeClassFor` call (#422: the SSOT the inline chains
// migrate onto) — or when it renders a partial that does (#696: theming moved into
// a shared partial still themes the template). The metric this ratchet protects is
// "per-system-aware templates", not any one spelling of it; see theme-awareness.mjs.

function listTemplates() {
    return [...walkFiles('src/templates', { ext: '.hbs' })];
}

function tally() {
    const sources = new Map(listTemplates().map((path) => [path, readFileSync(path, 'utf8')]));
    const { direct, inherited } = classifyThemeAwareness(sources, SYSTEM_IDS);
    const adoptedTemplates = [...sources.keys()].filter((path) => direct.has(path) || inherited.has(path));
    const perSystemHits = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 0]));

    for (const path of direct) {
        const text = sources.get(path) ?? '';
        for (const id of SYSTEM_IDS) {
            const matches = text.match(new RegExp(`\\b${id}:tw-`, 'g'));
            if (matches) perSystemHits[id] += matches.length;
        }
    }

    return {
        total: sources.size,
        adopted: adoptedTemplates.length,
        direct: direct.size,
        inherited: inherited.size,
        perSystemHits,
        adoptedTemplates,
    };
}

/** Number of per-system-aware templates (the ratcheted value). */
export function count() {
    return tally().adopted;
}

/** Write .theme-coverage.json and return the report object. */
export function writeReport() {
    const { total, adopted, direct, inherited, perSystemHits, adoptedTemplates } = tally();
    const report = {
        generatedAt: new Date().toISOString(),
        total,
        adopted,
        direct,
        inherited,
        perSystemHits,
        adoptedTemplates,
    };
    writeFileSync(COVERAGE_PATH, JSON.stringify(report, null, 2) + '\n');
    return report;
}
