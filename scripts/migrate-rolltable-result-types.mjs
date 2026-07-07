#!/usr/bin/env node
/**
 * Migrate legacy RollTable `TableResult` documents to the Foundry V13+ schema.
 *
 * Root cause of GH #419: rolltable pack `_source/*.json` results use the LEGACY
 * numeric result type (`"type": 0`) plus the old `documentId` / `documentCollection`
 * shape. Foundry V13+ redefined `TableResult.type` as a string `DocumentTypeField`
 * (`"text"` / `"document"`; the old `"pack"`/compendium type migrates to `"document"`)
 * and replaced `documentId` + `documentCollection` with a single `documentUuid`
 * `DocumentUUIDField`. A numeric `type` is not a valid DocumentType, so every result
 * fails validation, the table loads with zero results, and rolling it reports
 * "No available results".
 *
 * This module mirrors Foundry's own `BaseTableResult.migrateData` /
 * `#migrateDocumentUuid` (see `common/documents/table-result.mjs`) as a pure,
 * offline, idempotent transform so the pack `_source` JSON can be rewritten to the
 * V13+ shape ahead of the LevelDB compile.
 *
 * Legacy numeric type mapping (`CONST.TABLE_RESULT_TYPES`):
 *   0 (TEXT)       -> "text"
 *   1 (DOCUMENT)   -> "document"
 *   2 (COMPENDIUM) -> "document"   (the "pack"/compendium type was merged into "document")
 *
 * `documentUuid` construction (from the legacy `documentCollection` + `documentId`),
 * matching Foundry's `buildUuid`:
 *   - world document  (collection is a bare Document type name, e.g. "Actor") ->
 *       `<DocumentName>.<id>`               e.g. `Actor.abcd1234`
 *   - compendium pack (collection is a pack id, e.g. "wh40k-rpg.im-core-items") ->
 *       `Compendium.<packId>.<id>`          e.g. `Compendium.wh40k-rpg.im-core-items.abcd1234`
 *     (the embedded DocType is resolved by Foundry's `parseUuid` from the pack at
 *      load time; it is not knowable offline without the running `game.packs`, and
 *      Foundry's own `buildUuid` omits it here too.)
 *
 * CLI usage (idempotent -- safe to re-run; already-migrated results are skipped):
 *   node scripts/migrate-rolltable-result-types.mjs 'src/packs/**\/*rolltables*\/_source'
 *   node scripts/migrate-rolltable-result-types.mjs <dir-or-glob> [<dir-or-glob> ...]
 *
 * A path that resolves to a directory is scanned for `*.json` documents; a path
 * that resolves to a `.json` file is processed directly. Any JSON without a
 * `results` array is skipped (so a broad pack-root glob is safe).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Legacy numeric `CONST.TABLE_RESULT_TYPES` value for plain text results. */
const LEGACY_TYPE_TEXT = 0;

/** V13+ string DocumentType values for `TableResult.type`. */
const RESULT_TYPE_TEXT = 'text';
const RESULT_TYPE_DOCUMENT = 'document';

/** `TableResult.weight` default (Foundry schema `initial: 1`). */
const DEFAULT_WEIGHT = 1;

/**
 * Bare Document type names that, when stored in the legacy `documentCollection`,
 * denote a WORLD document (uuid `<DocumentName>.<id>`) rather than a compendium
 * pack id (uuid `Compendium.<packId>.<id>`). Mirrors Foundry's
 * `CONST.COMPENDIUM_DOCUMENT_TYPES` set used by `#migrateDocumentUuid`.
 */
const WORLD_DOCUMENT_TYPE_NAMES = new Set([
    'ActiveEffect',
    'Actor',
    'Adventure',
    'Cards',
    'Item',
    'JournalEntry',
    'Macro',
    'Playlist',
    'RollTable',
    'Scene',
]);

/** Legacy reference keys stripped from a migrated result (replaced by `documentUuid`). */
const LEGACY_REFERENCE_KEYS = ['documentId', 'documentCollection', 'collection'];

/**
 * True when the result still carries the legacy numeric `type`.
 * Used by both the migration (to convert) and the validation gate (to reject).
 */
export function resultTypeIsLegacyNumeric(result) {
    return typeof result?.type === 'number';
}

/**
 * Return the legacy-numeric-typed results of a rolltable document (empty when none).
 */
export function findLegacyNumericResults(doc) {
    if (!Array.isArray(doc?.results)) return [];
    return doc.results.filter(resultTypeIsLegacyNumeric);
}

/**
 * Build a V13+ `documentUuid` from a legacy `documentCollection` + `documentId`,
 * matching Foundry's `buildUuid`. Returns null when the reference is incomplete.
 */
export function buildDocumentUuid(documentCollection, documentId) {
    if (documentId == null || documentId === '') return null;
    if (documentCollection == null || documentCollection === '') return null;
    if (WORLD_DOCUMENT_TYPE_NAMES.has(documentCollection)) {
        return `${documentCollection}.${documentId}`;
    }
    return `Compendium.${documentCollection}.${documentId}`;
}

/**
 * Migrate a single `TableResult` object to the V13+ schema. Pure -- returns a new
 * object and never mutates the input. Idempotent: an already-migrated result is
 * returned unchanged (`changed: false`).
 *
 * @param {Record<string, unknown>} result
 * @returns {{ result: Record<string, unknown>, changed: boolean }}
 */
export function migrateResult(result) {
    const out = { ...result };
    let changed = false;

    // 1. type: legacy numeric -> string DocumentType.
    if (typeof out.type === 'number') {
        out.type = out.type === LEGACY_TYPE_TEXT ? RESULT_TYPE_TEXT : RESULT_TYPE_DOCUMENT;
        changed = true;
    }

    // 2. documentUuid for document results, from the legacy collection + id.
    const collection = out.documentCollection ?? out.collection ?? null;
    const documentId = out.documentId ?? null;
    if (
        out.type === RESULT_TYPE_DOCUMENT &&
        (out.documentUuid == null || out.documentUuid === '') &&
        documentId != null &&
        collection != null &&
        collection !== ''
    ) {
        const uuid = buildDocumentUuid(collection, documentId);
        if (uuid) {
            out.documentUuid = uuid;
            changed = true;
            // Foundry's #migrateDocumentUuid moves the legacy `text` into `name`
            // for document results (the document's label is the display text).
            if (out.name == null && typeof out.text === 'string') {
                out.name = out.text;
                out.text = '';
            }
        }
    }

    // 3. Drop legacy reference keys -- the V13+ schema has no documentId /
    //    documentCollection; they are subsumed by documentUuid.
    for (const key of LEGACY_REFERENCE_KEYS) {
        if (Object.hasOwn(out, key)) {
            delete out[key];
            changed = true;
        }
    }

    // 4. weight: default where missing (schema `initial: 1`, required positive int).
    if (out.weight == null) {
        out.weight = DEFAULT_WEIGHT;
        changed = true;
    }

    return { result: out, changed };
}

/**
 * Migrate every result of a rolltable document. Pure -- returns a new document when
 * anything changed, otherwise the original reference. A document without a
 * `results` array is returned untouched.
 *
 * @param {Record<string, unknown>} doc
 * @returns {{ doc: Record<string, unknown>, changed: boolean, resultsMigrated: number }}
 */
export function migrateRollTable(doc) {
    if (!Array.isArray(doc?.results)) {
        return { doc, changed: false, resultsMigrated: 0 };
    }
    let resultsMigrated = 0;
    const results = doc.results.map((entry) => {
        const { result, changed } = migrateResult(entry);
        if (changed) resultsMigrated += 1;
        return result;
    });
    const changed = resultsMigrated > 0;
    return { doc: changed ? { ...doc, results } : doc, changed, resultsMigrated };
}

/* -------------------------------------------------------------------------- */
/*  CLI                                                                        */
/* -------------------------------------------------------------------------- */

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

function main(argv) {
    const args = argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: node scripts/migrate-rolltable-result-types.mjs <dir-or-glob> [<dir-or-glob> ...]');
        console.error("  e.g. node scripts/migrate-rolltable-result-types.mjs 'src/packs/**/*rolltables*/_source'");
        process.exit(2);
    }

    const files = resolveJsonFiles(args);
    let filesChanged = 0;
    let filesSkipped = 0;
    let resultsMigrated = 0;

    for (const file of files) {
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
            console.error(`[migrate-rolltable] skip (unparseable JSON): ${file}: ${err.message}`);
            filesSkipped += 1;
            continue;
        }
        if (!Array.isArray(doc?.results)) {
            filesSkipped += 1;
            continue;
        }
        const migrated = migrateRollTable(doc);
        if (migrated.changed) {
            fs.writeFileSync(file, `${JSON.stringify(migrated.doc, null, 4)}\n`);
            filesChanged += 1;
            resultsMigrated += migrated.resultsMigrated;
        }
    }

    console.log('[migrate-rolltable] done:');
    console.log(`  json files scanned : ${files.length}`);
    console.log(`  rolltables changed : ${filesChanged}`);
    console.log(`  non-rolltable/skip : ${filesSkipped}`);
    console.log(`  results migrated   : ${resultsMigrated}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv);
}
