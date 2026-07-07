#!/usr/bin/env node
/**
 * Pack-validation gate for RollTable `TableResult.type` (guards GH #419).
 *
 * Fails (exit 1) if ANY rolltable `_source/*.json` result still carries the legacy
 * NUMERIC `type` (e.g. `"type": 0`). Foundry V13+ requires a string DocumentType
 * (`"text"` / `"document"`); a numeric type silently drops every result and the
 * table rolls "No available results". Once the migration
 * (`scripts/migrate-rolltable-result-types.mjs`) has run, this gate keeps the
 * regression from creeping back in via a hand-edited or re-imported pack file.
 *
 * Wire it into the pre-commit pack-validation step, e.g.:
 *   pnpm packs:validate:rolltables
 *
 * CLI usage (defaults to every rolltable pack source under `src/packs`):
 *   node scripts/validate-rolltable-types.mjs
 *   node scripts/validate-rolltable-types.mjs <dir-or-glob> [<dir-or-glob> ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { findLegacyNumericResults } from './migrate-rolltable-result-types.mjs';

/** Default scan target: every `_source/*.json` in any `*rolltables*` pack. */
const DEFAULT_GLOBS = ['src/packs/**/*rolltables*/_source/*.json'];

/** Expand CLI args (dirs / globs / files) into a de-duplicated list of `.json` paths. */
function resolveJsonFiles(args) {
    const files = new Set();
    for (const arg of args) {
        for (const match of fs.globSync(arg)) {
            let stat;
            try {
                stat = fs.statSync(match);
            } catch {
                continue;
            }
            if (stat.isDirectory()) {
                for (const nested of fs.globSync(path.join(match, '**/*.json'))) {
                    files.add(path.resolve(nested));
                }
            } else if (match.endsWith('.json')) {
                files.add(path.resolve(match));
            }
        }
    }
    return [...files].sort();
}

const args = process.argv.slice(2);
const globs = args.length > 0 ? args : DEFAULT_GLOBS;
const files = resolveJsonFiles(globs);

const violations = [];
let scanned = 0;

for (const file of files) {
    let doc;
    try {
        doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        violations.push(`${file}: unparseable JSON: ${err.message}`);
        continue;
    }
    if (!Array.isArray(doc?.results)) continue;
    scanned += 1;
    const legacy = findLegacyNumericResults(doc);
    if (legacy.length > 0) {
        const ids = legacy.map((r) => r?._id ?? '?').join(', ');
        violations.push(`${file}: ${legacy.length} result(s) with legacy NUMERIC TableResult.type [${ids}]`);
    }
}

if (violations.length > 0) {
    console.error('[validate-rolltable-types] FAIL: legacy numeric TableResult.type found');
    for (const v of violations) console.error(`  ${v}`);
    console.error('');
    console.error('Run: node scripts/migrate-rolltable-result-types.mjs <pack _source glob>');
    process.exit(1);
}

console.log(`[validate-rolltable-types] OK: ${scanned} rolltable(s) scanned; all TableResult.type are string DocumentTypes.`);
process.exit(0);
