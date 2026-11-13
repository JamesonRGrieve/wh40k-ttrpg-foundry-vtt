#!/usr/bin/env node
/**
 * Template-reference gate (`pnpm preload:drift`).
 *
 * Since #708 the bundle carries every file under `src/templates/` and registers
 * each as a partial before `init` (src/module/handlebars/template-sources.ts),
 * so the registry IS the template tree. What can still break at runtime is a
 * reference to a template that does not exist: Foundry then asks the server for
 * it, gets an error, and the sheet or partial fails to render. Storybook's
 * glob-based partial registration can hide that; this gate does not.
 *
 * It fails on any reference whose file is missing:
 *   - a partial in a `.hbs` template, `{{> path}}` or `{{#> path}}`, quoted or
 *     not, with or without the `.hbs` suffix;
 *   - a template path named in TypeScript under src/module (PARTS, renderTemplate,
 *     getTemplate), always written with `.hbs`.
 *
 * Pre-commit + CI gate.
 *
 * Usage:
 *   node scripts/preload-drift.mjs            # check, exit non-zero on a missing template
 *   node scripts/preload-drift.mjs --json     # JSON report on stdout
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { walkFiles } from './lib/walk.mjs';

const ROOT = process.cwd();
const TEMPLATES_ROOT = resolve(ROOT, 'src/templates');
const MODULE_ROOT = resolve(ROOT, 'src/module');
const jsonMode = process.argv.includes('--json');

const PREFIX = 'systems/wh40k-rpg/templates/';
// `{{> path}}`, `{{#> path}}`, `{{> "path"}}`; the path runs to whitespace, a quote or `}`.
const PARTIAL_RE = /\{\{#?>\s*"?(systems\/wh40k-rpg\/templates\/[^\s"}]+)/g;
// A template path string in TypeScript.
const TS_TEMPLATE_RE = /['"`](systems\/wh40k-rpg\/templates\/[^'"`$]+\.hbs)['"`]/g;

/** The file a template id names: `systems/wh40k-rpg/templates/a/b(.hbs)` → src/templates/a/b.hbs. */
function templateFile(id) {
    const rel = id.slice(PREFIX.length);
    return resolve(TEMPLATES_ROOT, rel.endsWith('.hbs') ? rel : `${rel}.hbs`);
}

/** Every match of `re` in each file, as `{ id, where }`. */
function references(files, re) {
    const found = [];
    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            for (const m of line.matchAll(re)) found.push({ id: m[1], where: `${relative(ROOT, file)}:${index + 1}` });
        });
    }
    return found;
}

const tsFiles = walkFiles(MODULE_ROOT, { ext: '.ts' }).filter((f) => !/\.(?:test|stories)\.ts$/.test(f) && !f.endsWith('.d.ts'));
const all = [...references(walkFiles(TEMPLATES_ROOT, { ext: '.hbs' }), PARTIAL_RE), ...references(tsFiles, TS_TEMPLATE_RE)];
const missing = all.filter((ref) => !existsSync(templateFile(ref.id)));

const report = { references: all.length, missing };
if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(missing.length > 0 ? 1 : 0);
}

if (missing.length > 0) {
    console.error(`[preload-drift] FAIL: ${missing.length} reference(s) to a template that does not exist:`);
    for (const ref of missing) console.error(`  ${ref.where}: ${ref.id}`);
    console.error('  Every file under src/templates is registered by the bundle (#708); fix the path or add the template.');
    process.exit(1);
}
console.log(`[preload-drift] OK: ${all.length} template references, every one resolves to a file`);
