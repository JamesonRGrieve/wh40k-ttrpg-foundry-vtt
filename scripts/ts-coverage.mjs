#!/usr/bin/env node
/**
 * Per-rule, per-directory TypeScript-strictness coverage.
 *
 * Counts these patterns across `src/module/**\/*.ts`:
 *   - bare `: any` annotations (excluding `any[]`/`<any>` generics — counted separately if useful)
 *   - ` as any` casts (and `as Array<any>` etc.)
 *   - `@ts-expect-error` directives
 *   - `@ts-ignore` directives
 *
 * Aggregates by top-level directory under `src/module/` (e.g. `applications/`,
 * `data/`, `documents/`). The ratchet (scripts/ts-ratchet.mjs) consumes the
 * JSON output and refuses commits that increase any per-directory count for
 * any of these metrics.
 *
 * Outputs:
 *   .ts-coverage.json — machine-readable.
 *   stdout            — markdown table.
 *
 * Usage:
 *   node scripts/ts-coverage.mjs            # write report + print table
 *   node scripts/ts-coverage.mjs --json     # JSON only on stdout
 *   node scripts/ts-coverage.mjs --quiet    # write report, no stdout
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/module');
const OUT = resolve(process.cwd(), '.ts-coverage.json');
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const quiet = args.has('--quiet');

const METRICS = ['any', 'asAny', 'tsExpectError', 'tsIgnore'];

// Patterns. The classifier is intentionally simple — counts string occurrences
// across non-comment-stripped source. False positives in comments are OK in
// the aggregate; the ratchet tolerates noise as long as it's stable.
const PATTERNS = {
    // bare `: any` — colon-space-any followed by non-word (so `anything` doesn't match)
    any: /(^|[^A-Za-z0-9_$]):\s*any\b/g,
    // ` as any` — case-sensitive
    asAny: /\bas\s+any\b/g,
    tsExpectError: /@ts-expect-error\b/g,
    tsIgnore: /@ts-ignore\b/g,
};

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (st.isFile() && name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.test.ts')) yield full;
    }
}

function topLevelDir(file) {
    // file is absolute. Compute relative-to-ROOT and take the first path segment.
    // Files at the root of ROOT get "_root".
    const rel = relative(ROOT, file);
    const parts = rel.split(sep);
    return parts.length === 1 ? '_root' : parts[0];
}

const byDir = {};
const byFile = {};
const totals = Object.fromEntries(METRICS.map((m) => [m, 0]));
let totalFiles = 0;

for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    const counts = Object.fromEntries(METRICS.map((m) => [m, 0]));
    for (const m of METRICS) {
        const re = new RegExp(PATTERNS[m].source, PATTERNS[m].flags);
        let n = 0;
        while (re.exec(src) !== null) n++;
        counts[m] = n;
        totals[m] += n;
    }

    const dir = topLevelDir(file);
    byDir[dir] ??= Object.fromEntries([...METRICS.map((m) => [m, 0]), ['files', 0]]);
    for (const m of METRICS) byDir[dir][m] += counts[m];
    byDir[dir].files++;

    const rel = relative(process.cwd(), file);
    if (METRICS.some((m) => counts[m] > 0)) byFile[rel] = counts;
    totalFiles++;
}

const summary = { files: totalFiles, ...totals };
const payload = { generatedAt: new Date().toISOString(), summary, byDir, byFile };
const serialized = JSON.stringify(payload, null, 2) + '\n';

if (!jsonOnly) writeFileSync(OUT, serialized, 'utf8');

if (jsonOnly) {
    process.stdout.write(serialized);
    process.exit(0);
}

if (quiet) {
    process.exit(0);
}

const dirs = Object.keys(byDir).sort();
console.log(`\n[ts-coverage] ${totalFiles} files under src/module/`);
console.log(
    `  totals — any: ${totals.any}, as any: ${totals.asAny}, ` +
        `@ts-expect-error: ${totals.tsExpectError}, @ts-ignore: ${totals.tsIgnore}`,
);
console.log('');
console.log('| directory | files | any | as any | @ts-expect-error | @ts-ignore |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const d of dirs) {
    const r = byDir[d];
    console.log(`| ${d} | ${r.files} | ${r.any} | ${r.asAny} | ${r.tsExpectError} | ${r.tsIgnore} |`);
}
console.log('');
console.log(`Report written to ${OUT}.`);
