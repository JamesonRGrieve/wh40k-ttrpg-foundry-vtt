#!/usr/bin/env node
/**
 * Preload-list drift detector.
 *
 * Cross-references the partial paths referenced at runtime in `.hbs` templates
 * (via Handlebars `{{> systems/wh40k-rpg/templates/...}}` calls) against the
 * preload list in `src/module/handlebars/handlebars-manager.ts`. Reports:
 *
 *   - Partials referenced in templates but missing from preload list (drift).
 *     This is a real bug — Foundry will fail to render them at runtime even
 *     though Storybook's glob-based registration may hide the problem.
 *
 *   - Partials in the preload list but no longer referenced anywhere (dead).
 *     Cosmetic but worth removing.
 *
 *   - Preload-list entries pointing to non-existent files (rotted). Hard fail.
 *
 * Pre-commit + CI gate.
 *
 * Usage:
 *   node scripts/preload-drift.mjs            # check, exit non-zero on drift
 *   node scripts/preload-drift.mjs --json     # JSON report on stdout
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATES_ROOT = resolve(process.cwd(), 'src/templates');
const MANAGER = resolve(process.cwd(), 'src/module/handlebars/handlebars-manager.ts');
const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');

const PARTIAL_PREFIX = 'systems/wh40k-rpg/templates/';
// Matches both `{{> path}}` (inline partial) and `{{#> path ...}}` (block partial).
const PARTIAL_RE = /\{\{#?>\s*(systems\/wh40k-rpg\/templates\/[^\s}]+\.hbs)\b/g;
const PRELOAD_RE = /['"](systems\/wh40k-rpg\/templates\/[^'"]+\.hbs)['"]/g;

function* walkHbs(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walkHbs(full);
        else if (st.isFile() && name.endsWith('.hbs')) yield full;
    }
}

function templatePathToFs(p) {
    // systems/wh40k-rpg/templates/foo/bar.hbs → src/templates/foo/bar.hbs
    return resolve(process.cwd(), 'src/templates', p.slice(PARTIAL_PREFIX.length));
}

const referenced = new Set();
for (const f of walkHbs(TEMPLATES_ROOT)) {
    const src = readFileSync(f, 'utf8');
    let m;
    while ((m = PARTIAL_RE.exec(src)) !== null) {
        referenced.add(m[1]);
    }
}

const managerSrc = readFileSync(MANAGER, 'utf8');
const preload = new Set();
let m2;
while ((m2 = PRELOAD_RE.exec(managerSrc)) !== null) {
    preload.add(m2[1]);
}

const referencedNotInPreload = [...referenced].filter((p) => !preload.has(p)).sort();
const preloadNotReferenced = [...preload].filter((p) => !referenced.has(p)).sort();
const preloadRotted = [...preload].filter((p) => !existsSync(templatePathToFs(p))).sort();

const report = {
    referencedNotInPreload,
    preloadNotReferenced,
    preloadRotted,
    counts: {
        templates: referenced.size,
        preload: preload.size,
        referencedNotInPreload: referencedNotInPreload.length,
        preloadNotReferenced: preloadNotReferenced.length,
        preloadRotted: preloadRotted.length,
    },
};

if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    const fail = referencedNotInPreload.length > 0 || preloadRotted.length > 0;
    process.exit(fail ? 1 : 0);
}

const fail = referencedNotInPreload.length > 0 || preloadRotted.length > 0;

if (referencedNotInPreload.length) {
    console.error(
        `[preload-drift] FAIL: ${referencedNotInPreload.length} partial(s) referenced in .hbs but missing from preloadHandlebarsTemplates():`,
    );
    for (const p of referencedNotInPreload) console.error(`  ${p}`);
    console.error('  Add these paths to src/module/handlebars/handlebars-manager.ts.');
}
if (preloadRotted.length) {
    console.error(
        `\n[preload-drift] FAIL: ${preloadRotted.length} preload entrie(s) point to non-existent files:`,
    );
    for (const p of preloadRotted) console.error(`  ${p}`);
    console.error('  Remove these from preloadHandlebarsTemplates().');
}
if (preloadNotReferenced.length) {
    // Warning, not failure. A preloaded partial may be referenced from .ts
    // (e.g. renderTemplate(...) calls) instead of `{{> ... }}`.
    console.warn(
        `\n[preload-drift] WARN: ${preloadNotReferenced.length} preload entrie(s) have no {{> ... }} reference:`,
    );
    for (const p of preloadNotReferenced) console.warn(`  ${p}`);
    console.warn('  These may be referenced from .ts code (renderTemplate, etc.). Verify before removing.');
}

if (!fail) console.log('[preload-drift] OK');
process.exit(fail ? 1 : 0);
