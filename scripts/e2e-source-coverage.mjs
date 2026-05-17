#!/usr/bin/env node
// Merge per-test v8 JS coverage dumps from .e2e-raw-coverage/ into a single
// istanbul-compatible coverage report against src/module/**/*.ts, using the
// dist/*.js.map source maps emitted by the gulp build.
//
// Inputs:
//   .e2e-raw-coverage/*.json   (page.coverage.stopJSCoverage() output, filtered
//                               to /systems/wh40k-rpg/module/*.js)
//   dist/module/**/*.js + *.map
//   src/module/**/*.ts          (target attribution)
//
// Output:
//   .e2e-source-coverage/coverage-final.json   (istanbul format)
//   .e2e-source-coverage/coverage-summary.json (per-file + total summary)
//   .e2e-source-coverage/lcov.info             (lcov for tooling)

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import v8toIstanbul from 'v8-to-istanbul';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = resolve(REPO_ROOT, '.e2e-raw-coverage');
const DIST_DIR = resolve(REPO_ROOT, 'dist');
const OUT_DIR = resolve(REPO_ROOT, '.e2e-source-coverage');

if (!existsSync(RAW_DIR) || readdirSync(RAW_DIR).length === 0) {
    console.error(`e2e-source-coverage — ${RAW_DIR} is empty. Run \`pnpm test:e2e\` first.`);
    process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

const map = libCoverage.createCoverageMap({});

function urlToDistPath(url) {
    // url looks like http://127.0.0.1:30001/systems/wh40k-rpg/module/foo/bar.js
    const ix = url.indexOf('/systems/wh40k-rpg/');
    if (ix < 0) return null;
    const rel = url.slice(ix + '/systems/wh40k-rpg/'.length);
    return resolve(DIST_DIR, rel);
}

let processed = 0;
let skipped = 0;

for (const file of readdirSync(RAW_DIR)) {
    if (!file.endsWith('.json')) continue;
    const fullPath = resolve(RAW_DIR, file);
    const entries = JSON.parse(readFileSync(fullPath, 'utf8'));
    for (const entry of entries) {
        const distPath = urlToDistPath(entry.url);
        if (!distPath || !existsSync(distPath)) {
            skipped++;
            continue;
        }
        try {
            const converter = v8toIstanbul(distPath, 0, { source: entry.source });
            // v8-to-istanbul auto-discovers <distPath>.map sibling.
            await converter.load();
            converter.applyCoverage(entry.functions);
            const data = converter.toIstanbul();
            // Filter to only files under src/module/ — keep our system code,
            // drop any incidental node_modules attributions.
            const filtered = {};
            for (const [filePath, fileCov] of Object.entries(data)) {
                if (filePath.includes('/src/module/') && filePath.endsWith('.ts')) {
                    filtered[filePath] = fileCov;
                }
            }
            if (Object.keys(filtered).length > 0) {
                map.merge(filtered);
                processed++;
            } else {
                skipped++;
            }
            converter.destroy();
        } catch (err) {
            // Source map missing or malformed; skip.
            skipped++;
        }
    }
}

// Write istanbul outputs.
writeFileSync(resolve(OUT_DIR, 'coverage-final.json'), JSON.stringify(map.toJSON(), null, 2));

const context = libReport.createContext({
    dir: OUT_DIR,
    coverageMap: map,
    defaultSummarizer: 'pkg',
});
reports.create('json-summary', {}).execute(context);
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);

const summary = JSON.parse(readFileSync(resolve(OUT_DIR, 'coverage-summary.json'), 'utf8'));
const total = summary.total ?? {};
console.log(`e2e-source-coverage — ${processed} v8 entries merged, ${skipped} skipped`);
console.log(
    `  lines:      ${total.lines?.pct ?? 0}% (${total.lines?.covered ?? 0}/${total.lines?.total ?? 0})`,
);
console.log(
    `  statements: ${total.statements?.pct ?? 0}% (${total.statements?.covered ?? 0}/${total.statements?.total ?? 0})`,
);
console.log(
    `  functions:  ${total.functions?.pct ?? 0}% (${total.functions?.covered ?? 0}/${total.functions?.total ?? 0})`,
);
console.log(
    `  branches:   ${total.branches?.pct ?? 0}% (${total.branches?.covered ?? 0}/${total.branches?.total ?? 0})`,
);
console.log(`  → ${OUT_DIR}/`);
