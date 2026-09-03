#!/usr/bin/env node
/**
 * Image-coverage ratchet (all entity types).
 *
 * src/packs/validate-images.cjs is warn-only; this gates REGRESSION of art
 * coverage. Unlike the defect ratchets (a per-rule count may only FALL), this is
 * an ADOPTION ratchet like `theme:ratchet`: the count of documents with real art,
 * PER Foundry document class (Actor / Item / JournalEntry / RollTable / Adventure
 * / …), may only RISE — never fall. This is the correct shape for coverage:
 * authoring new, legitimately un-arted content never trips it; only losing art —
 * replacing a curated portrait with a placeholder, or deleting an arted document —
 * does. Image coverage is bounded by source-art availability (an inherent limit,
 * not a defect), so no class "graduates to strict"; re-baseline upward as art
 * lands with `pnpm images:ratchet:update`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateImagePacks } = require('../src/packs/validate-images.cjs');

const BASELINE = resolve(process.cwd(), '.images-baseline');
const updateMode = process.argv.includes('--update');

const report = validateImagePacks({ rootDir: resolve(process.cwd(), 'src/packs'), log: () => {} });

/** Per-class arted (real-art) counts — the covered totals the ratchet protects. */
const cur = report.arted;

const loadBaseline = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null);
const writeBaseline = (byClass) => writeFileSync(BASELINE, `${JSON.stringify({ byClass }, null, 2)}\n`, 'utf8');
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

if (updateMode) {
    writeBaseline(cur);
    console.log(`[images-ratchet] baseline updated: ${total(cur)} arted document(s) across ${Object.keys(cur).length} class(es).`);
    process.exit(0);
}

const base = loadBaseline();
if (!base) {
    writeBaseline(cur);
    console.log(`[images-ratchet] baseline missing — initialised at ${total(cur)} arted document(s).`);
    process.exit(0);
}

const failures = [];
for (const [cls, b] of Object.entries(base.byClass || {})) {
    const n = cur[cls] ?? 0;
    if (n < b) failures.push(`${cls}: ${b} -> ${n} (-${b - n} arted)`);
}

if (failures.length) {
    console.error('[images-ratchet] FAIL — image coverage regressed:');
    for (const f of failures) console.error(`  ${f}`);
    console.error('Restore the art, or if the drop is intentional (e.g. documents removed) run `pnpm images:ratchet:update`.');
    process.exit(1);
}

const improved = Object.entries(cur).some(([cls, n]) => n > (base.byClass?.[cls] ?? 0));
console.log(
    improved
        ? '[images-ratchet] OK: coverage improved — raise the baseline with `pnpm images:ratchet:update`.'
        : `[images-ratchet] OK: no regressions (${total(cur)} arted document(s) tracked).`,
);
process.exit(0);
