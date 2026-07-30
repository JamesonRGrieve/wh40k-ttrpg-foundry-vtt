#!/usr/bin/env node
/**
 * Every `[data-wh40k-hook="X"]` used as a SELECTOR must have a producer —
 * some template or TS-emitted markup that actually writes `data-wh40k-hook="X"`
 * onto an element.
 *
 * This exists because the class -> `data-wh40k-hook` migration had a silent
 * failure mode: a selector like `.csd-char-slot:not(.has-roll)` was rewritten to
 * `[data-wh40k-hook="csd-char-slot"]:not([data-wh40k-hook="has-roll"])` while
 * `has-roll` stayed a plain class on the template. An element carries exactly one
 * `data-wh40k-hook`, so the `:not()` matched everything and the filter silently
 * became a no-op — no error, no failing test, just the wrong elements selected.
 *
 * An orphaned hook is either a selector that can never match or, worse (as above),
 * a negation that can never exclude. Both are bugs, so this is a hard gate.
 *
 * Usage:
 *   node scripts/hook-orphan-audit.mjs           # report + exit 1 on any orphan
 *   node scripts/hook-orphan-audit.mjs --json    # machine-readable
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { walkFiles } from './lib/walk.mjs';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));

/** Hook names written onto an element: `data-wh40k-hook="foo"` in markup or a TS string. */
const PRODUCER_RE = /data-wh40k-hook\s*=\s*["']([a-zA-Z0-9_-]+)["']/g;
/** Hook names read back out: `[data-wh40k-hook="foo"]` inside a selector string. */
const SELECTOR_RE = /\[\s*data-wh40k-hook\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*\]/g;
/** `dataset.wh40kHook = 'foo'` / `setAttribute('data-wh40k-hook', 'foo')` producers. */
const DATASET_RE = /(?:dataset\s*\.\s*wh40kHook\s*=|setAttribute\(\s*['"]data-wh40k-hook['"]\s*,)\s*['"]([a-zA-Z0-9_-]+)['"]/g;

const SOURCE_DIRS = ['src', 'stories', 'tests'];
const EXTS = ['.hbs', '.ts', '.js', '.mjs'];

const produced = new Set();
/** @type {Map<string, string[]>} hook -> ["file:line", …] */
const consumed = new Map();
/** @type {{site: string, hooks: string[]}[]} elements carrying more than one hook */
const duplicates = [];

/**
 * Elements that declare `data-wh40k-hook` more than once.
 *
 * This has to be caught in SOURCE, not in a rendered DOM: the HTML parser keeps
 * the first occurrence and discards the rest, so by the time a test can query
 * the element the duplicate is already gone and every assertion about it passes
 * vacuously. (Verified — a test asserting "exactly one hook attribute" passes
 * against a template that declares two.)
 *
 * Handlebars expressions are blanked first so a `>` inside `{{…}}` cannot end a
 * tag early; the remaining `<…>` spans are real element tags.
 */
function findDuplicateHooks(src, rel) {
    const blanked = src.replace(/\{\{[^}]*\}\}/g, (m) => ' '.repeat(m.length));
    for (const tag of blanked.matchAll(/<[a-zA-Z][^<>]*>/g)) {
        const hooks = [...tag[0].matchAll(/data-wh40k-hook\s*=\s*["']([a-zA-Z0-9_-]+)["']/g)].map((h) => h[1]);
        if (hooks.length < 2) continue;
        const line = src.slice(0, tag.index).split('\n').length;
        duplicates.push({ site: `${rel}:${line}`, hooks });
    }
}

for (const dir of SOURCE_DIRS) {
    for (const ext of EXTS) {
        for (const file of walkFiles(resolve(ROOT, dir), { ext })) {
            const src = readFileSync(file, 'utf8');
            const rel = relative(ROOT, file);

            SELECTOR_RE.lastIndex = 0;
            let m;
            while ((m = SELECTOR_RE.exec(src)) !== null) {
                const line = src.slice(0, m.index).split('\n').length;
                const sites = consumed.get(m[1]) ?? [];
                sites.push(`${rel}:${line}`);
                consumed.set(m[1], sites);
            }

            // Producers are scanned over the source with every SELECTOR occurrence
            // removed. `[data-wh40k-hook="foo"]` contains a literal
            // `data-wh40k-hook="foo"`, so scanning the raw source would count every
            // selector as its own producer and no orphan could ever be reported —
            // the audit would pass vacuously, which is the exact defect class it
            // exists to catch. (Caught by mutation-testing the audit itself.)
            const withoutSelectors = src.replace(SELECTOR_RE, ' ');
            for (const re of [PRODUCER_RE, DATASET_RE]) {
                re.lastIndex = 0;
                let p;
                while ((p = re.exec(withoutSelectors)) !== null) produced.add(p[1]);
            }

            findDuplicateHooks(withoutSelectors, rel);
        }
    }
}

const orphans = [...consumed.entries()].filter(([hook]) => !produced.has(hook)).sort(([a], [b]) => a.localeCompare(b));

if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify({ produced: produced.size, consumed: consumed.size, orphans, duplicates }, null, 2)}\n`);
    process.exit(orphans.length === 0 && duplicates.length === 0 ? 0 : 1);
}

console.log(`[hook-orphan-audit] ${produced.size} hook names produced, ${consumed.size} consumed by selectors.`);

if (orphans.length === 0 && duplicates.length === 0) {
    console.log('  No orphaned hook selectors, no duplicate hook attributes.');
    process.exit(0);
}

if (orphans.length > 0) {
    console.log(`\n${orphans.length} orphaned hook selector(s) — no element ever carries these:\n`);
    for (const [hook, sites] of orphans) {
        console.log(`  data-wh40k-hook="${hook}"`);
        for (const site of sites) console.log(`      ${site}`);
    }
    console.log('\nEither the producing template lost the attribute, or the selector was ported from a');
    console.log('class that is still a class. A selector that can never match is a bug, not dead code.');
}

if (duplicates.length > 0) {
    console.log(`\n${duplicates.length} element(s) declaring data-wh40k-hook more than once:\n`);
    for (const { site, hooks } of duplicates) {
        console.log(`  ${site}`);
        console.log(`      ${hooks.map((h) => `data-wh40k-hook="${h}"`).join(' ')}`);
    }
    console.log('\nAn element carries exactly ONE hook — the parser keeps the first and DISCARDS the');
    console.log('rest, so every hook after the first silently stops existing. Keep the identifying');
    console.log('hook and move the second marker to its own attribute (e.g. data-has-roll).');
}

process.exit(1);
