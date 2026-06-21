// Single source for the sheet/data/docs coverage-symmetry scan.
//
// The gate (scripts/coverage-symmetry.mjs) and the ratchet
// (scripts/symmetry-ratchet.mjs) used to carry verbatim copies of this scan —
// same exclusions, same opt-out handling, same -sheet/-dialog detection. When
// the copies drifted (e.g. a new naming convention added to one), the ratchet
// could pass while the gate failed, defeating the mechanism. Both now consume
// scanMissingPairs() so detection is identical by construction.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { walkFiles } from './walk.mjs';

const ROOT = resolve(process.cwd(), 'src/module');
const OPT_OUT_PATH = resolve(process.cwd(), '.coverage-opt-out.json');

function loadOptOut() {
    return existsSync(OPT_OUT_PATH)
        ? JSON.parse(readFileSync(OPT_OUT_PATH, 'utf8'))
        : { stories: [], data: [], documents: [] };
}

function siblingExists(file, suffix) {
    // Replace .ts → suffix.ts (e.g. weapon.ts → weapon.test.ts)
    return existsSync(file.replace(/\.ts$/, suffix));
}

/**
 * Scan src/module for the three required coverage pairings:
 *   1. applications/*-{sheet,dialog}.ts (or *Sheet/*Dialog.ts) → co-located .stories.ts
 *   2. data/**\/*.ts                                            → co-located .test.ts
 *   3. documents/**\/*.ts                                       → co-located .test.ts
 *
 * Each rule honours `.coverage-opt-out.json` and the shared exclusions
 * (`.test.ts`, `.stories.ts`, `.d.ts`, `_module.ts`).
 *
 * @returns {{ sheetMissing: string[], dataMissing: string[], docsMissing: string[] }}
 */
export function scanMissingPairs() {
    const optOut = loadOptOut();
    const sheetMissing = [];
    const dataMissing = [];
    const docsMissing = [];

    // Rule 1 — sheets/dialogs/prompts → stories
    for (const file of walkFiles(`${ROOT}/applications`)) {
        if (!file.endsWith('.ts')) continue;
        if (file.endsWith('.test.ts') || file.endsWith('.stories.ts') || file.endsWith('.d.ts')) continue;
        const base = file.split('/').pop();
        if (base === '_module.ts') continue;
        const isSheet = /-sheet\.ts$/.test(base) || /Sheet\.ts$/.test(base);
        const isDialog = /-dialog\.ts$/.test(base) || /Dialog\.ts$/.test(base);
        if (!isSheet && !isDialog) continue;
        if (siblingExists(file, '.stories.ts')) continue;
        const rel = relative(process.cwd(), file);
        if (optOut.stories?.includes(rel)) continue;
        sheetMissing.push(rel);
    }

    // Rule 2 — data files → tests
    for (const file of walkFiles(`${ROOT}/data`)) {
        if (!file.endsWith('.ts')) continue;
        if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
        const base = file.split('/').pop();
        if (base === '_module.ts') continue;
        if (siblingExists(file, '.test.ts')) continue;
        const rel = relative(process.cwd(), file);
        if (optOut.data?.includes(rel)) continue;
        dataMissing.push(rel);
    }

    // Rule 3 — documents → tests
    for (const file of walkFiles(`${ROOT}/documents`)) {
        if (!file.endsWith('.ts')) continue;
        if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
        const base = file.split('/').pop();
        if (base === '_module.ts') continue;
        if (siblingExists(file, '.test.ts')) continue;
        const rel = relative(process.cwd(), file);
        if (optOut.documents?.includes(rel)) continue;
        docsMissing.push(rel);
    }

    return { sheetMissing, dataMissing, docsMissing };
}
