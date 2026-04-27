#!/usr/bin/env node
/**
 * Symmetry gate. Enforces three coverage rules:
 *
 *   1. Every file matching `src/module/applications/**\/*-{sheet,dialog}.ts`
 *      OR `src/module/applications/prompts/**\/*-dialog.ts` (the prompts dir
 *      uses *-dialog.ts naming for prompts) must have a co-located
 *      `*.stories.ts` sibling.
 *
 *   2. Every file under `src/module/data/**\/*.ts` (excluding `_module.ts`,
 *      `*.test.ts`, `*.d.ts`) must have a co-located `*.test.ts` sibling
 *      OR appear in `.coverage-opt-out.json` under `"data"`.
 *
 *   3. Every file under `src/module/documents/**\/*.ts` (excluding the
 *      same exclusions) must have a co-located `*.test.ts` sibling OR
 *      appear in `.coverage-opt-out.json` under `"documents"`.
 *
 * Pre-commit + CI gate. Without these, "every component has a story" is
 * just a wish — symmetry makes it a build error.
 *
 * Outputs missing pairs to stderr and exits non-zero on violations.
 *
 * Usage:
 *   node scripts/coverage-symmetry.mjs            # check
 *   node scripts/coverage-symmetry.mjs --json     # JSON report on stdout
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/module');
const OPT_OUT_PATH = resolve(process.cwd(), '.coverage-opt-out.json');
const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');

const optOut = existsSync(OPT_OUT_PATH)
    ? JSON.parse(readFileSync(OPT_OUT_PATH, 'utf8'))
    : { stories: [], data: [], documents: [] };

function* walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (st.isFile()) yield full;
    }
}

function siblingExists(file, suffix) {
    // Replace .ts → suffix.ts (e.g. weapon.ts → weapon.test.ts)
    return existsSync(file.replace(/\.ts$/, suffix));
}

const sheetMissing = [];
const dataMissing = [];
const docsMissing = [];

// Rule 1 — sheets/dialogs/prompts → stories
for (const file of walk(`${ROOT}/applications`)) {
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
for (const file of walk(`${ROOT}/data`)) {
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
for (const file of walk(`${ROOT}/documents`)) {
    if (!file.endsWith('.ts')) continue;
    if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
    const base = file.split('/').pop();
    if (base === '_module.ts') continue;
    if (siblingExists(file, '.test.ts')) continue;
    const rel = relative(process.cwd(), file);
    if (optOut.documents?.includes(rel)) continue;
    docsMissing.push(rel);
}

const report = { sheetMissing, dataMissing, docsMissing };

if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    const total = sheetMissing.length + dataMissing.length + docsMissing.length;
    process.exit(total === 0 ? 0 : 1);
}

const total = sheetMissing.length + dataMissing.length + docsMissing.length;
if (total === 0) {
    console.log('[coverage-symmetry] OK');
    process.exit(0);
}

console.error(`[coverage-symmetry] FAIL: ${total} missing pair(s)`);
if (sheetMissing.length) {
    console.error(`\n  Sheets/Dialogs missing .stories.ts (${sheetMissing.length}):`);
    for (const f of sheetMissing) console.error(`    ${f}`);
}
if (dataMissing.length) {
    console.error(`\n  Data files missing .test.ts (${dataMissing.length}):`);
    for (const f of dataMissing) console.error(`    ${f}`);
}
if (docsMissing.length) {
    console.error(`\n  Document files missing .test.ts (${docsMissing.length}):`);
    for (const f of docsMissing) console.error(`    ${f}`);
}
console.error('\nFix by adding the sibling test/story file, or add the path to .coverage-opt-out.json with a reason.');
process.exit(1);
