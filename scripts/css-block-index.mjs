#!/usr/bin/env node
/**
 * Parse the source-path markers in src/css/wh40k-rpg.css (each marker is
 * a CSS comment of the form: <slash-star> ── source: PATH ── <star-slash>)
 * and write .css-blocks.json mapping each original source path to the
 * line range(s) it occupies in the monolith.
 *
 * The monolith is a concatenation of the original component CSS files;
 * the markers preserve the original boundaries. A given source path may
 * appear multiple times (interleaved imports re-emit the marker), so
 * each entry is an array of {start, end} ranges measured in 1-based
 * line numbers, end-inclusive. `end` is the line BEFORE the next marker
 * (or EOF for the last block).
 *
 * Usage:
 *   node scripts/css-block-index.mjs            # write .css-blocks.json
 *   node scripts/css-block-index.mjs --check    # exit non-zero if stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MONOLITH = resolve(process.cwd(), 'src/css/wh40k-rpg.css');
const OUT = resolve(process.cwd(), '.css-blocks.json');
const MARKER_RE = /^\/\*\s*──\s*source:\s*(\S.*?)\s*──\s*\*\/\s*$/;

const checkMode = process.argv.includes('--check');

const text = readFileSync(MONOLITH, 'utf8');
const lines = text.split('\n');

const markers = [];
for (let i = 0; i < lines.length; i++) {
    const m = MARKER_RE.exec(lines[i]);
    if (m) markers.push({ source: m[1], line: i + 1 });
}

const ranges = {};
for (let i = 0; i < markers.length; i++) {
    const { source, line } = markers[i];
    const next = markers[i + 1];
    const end = next ? next.line - 1 : lines.length;
    if (!ranges[source]) ranges[source] = [];
    ranges[source].push({ start: line, end });
}

const totalCovered = Object.values(ranges).reduce(
    (n, list) => n + list.reduce((m, r) => m + (r.end - r.start + 1), 0),
    0,
);
const summary = {
    monolithLines: lines.length,
    markers: markers.length,
    distinctSources: Object.keys(ranges).length,
    coveredLines: totalCovered,
    uncoveredLines: lines.length - totalCovered,
};

const payload = {
    generatedAt: new Date().toISOString(),
    summary,
    ranges,
};

const serialized = JSON.stringify(payload, null, 2) + '\n';

if (checkMode) {
    if (!existsSync(OUT)) {
        console.error('[css-block-index] .css-blocks.json missing — run: pnpm css:block-index');
        process.exit(1);
    }
    const onDisk = JSON.parse(readFileSync(OUT, 'utf8'));
    // Compare structure, ignoring the generatedAt timestamp.
    const a = JSON.stringify({ summary: onDisk.summary, ranges: onDisk.ranges });
    const b = JSON.stringify({ summary, ranges });
    if (a !== b) {
        console.error('[css-block-index] .css-blocks.json is stale — run: pnpm css:block-index');
        process.exit(1);
    }
    console.log(`[css-block-index] OK (${summary.distinctSources} sources, ${summary.markers} markers)`);
    process.exit(0);
}

writeFileSync(OUT, serialized, 'utf8');
console.log(
    `[css-block-index] wrote ${OUT}: ${summary.distinctSources} sources, ${summary.markers} markers, ` +
        `${summary.coveredLines}/${summary.monolithLines} lines covered (${summary.uncoveredLines} unmarked).`,
);
