#!/usr/bin/env node
/**
 * Move a behavioural class hook off `class="…"` and onto `data-wh40k-hook="…"`.
 *
 * A class name that exists only so JS or a spec can find an element is not
 * styling — it keeps its template in `css:coverage`'s `mixed` bucket while
 * carrying no CSS. This rewrites both halves of such a hook:
 *
 *   template  <span class="wh40k-dw-oath-current tw-font-bold">
 *          →  <span data-wh40k-hook="dw-oath-current" class="tw-font-bold">
 *
 *   consumer  querySelector('.wh40k-dw-oath-current')
 *          →  querySelector('[data-wh40k-hook="dw-oath-current"]')
 *
 * The hook id is the class name with any leading `wh40k-` stripped, so the
 * attribute value stays readable and collision-free.
 *
 * It does NOT fix the thing that makes this migration dangerous: a spec that
 * locates an element and then only reads it (`el?.textContent ?? ''`) passes
 * silently once the selector matches nothing. Every rewritten consumer must be
 * reviewed for an explicit existence assertion — this script reports each
 * consumer site it touched so that review has a worklist.
 *
 * Usage:
 *   node scripts/migrate-hook-classes.mjs <class-name> [<class-name> …]
 *   node scripts/migrate-hook-classes.mjs --dry <class-name> …
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { walkFiles } from './lib/walk.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const classes = args.filter((a) => a !== '--dry');
if (classes.length === 0) {
    console.error('usage: node scripts/migrate-hook-classes.mjs [--dry] <class-name> …');
    process.exit(2);
}

const hookId = (cls) => cls.replace(/^wh40k-/, '');

/** Every file that could reference a hook: templates, module code, tests, stories. */
function candidateFiles() {
    const found = [];
    for (const dir of ['src/templates', 'src/module', 'tests', 'stories']) {
        for (const ext of ['.hbs', '.ts', '.js']) {
            for (const f of walkFiles(dir, { ext })) found.push(f);
        }
    }
    return [...new Set(found)];
}

/**
 * Strip `cls` from every `class="…"` attribute in `src` and add
 * `data-wh40k-hook="<id>"` to the owning tag. Returns [text, count].
 */
function rewriteTemplate(src, cls) {
    const id = hookId(cls);
    let count = 0;
    // Walk each `class="…"` attribute; when it holds the token, drop the token
    // and insert the data attribute immediately before the `class` attribute so
    // the hook reads first on the tag.
    const out = src.replace(/class\s*=\s*"([^"]*)"/g, (whole, value) => {
        const tokens = value.split(/(\s+)/);
        if (!tokens.includes(cls)) return whole;
        count++;
        const kept = value
            .split(/\s+/)
            .filter((t) => t !== cls)
            .join(' ')
            .trim();
        const classAttr = kept === '' ? '' : ` class="${kept}"`;
        return `data-wh40k-hook="${id}"${classAttr}`.replace(/^/, '');
    });
    return [out, count];
}

/** Rewrite `.cls` selector occurrences in a consumer file. Returns [text, sites]. */
function rewriteConsumer(src, cls) {
    const id = hookId(cls);
    const sites = [];
    const lines = src.split('\n');
    // `.<cls>` as a CSS selector fragment: preceded by a quote, a combinator, a
    // `(` or whitespace, and not part of a longer identifier.
    const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![\\w-])`, 'g');
    const outLines = lines.map((line, i) => {
        if (!re.test(line)) return line;
        re.lastIndex = 0;
        sites.push(i + 1);
        return line.replace(re, `[data-wh40k-hook="${id}"]`);
    });
    return [outLines.join('\n'), sites];
}

const files = candidateFiles();
let totalTemplate = 0;
const consumerReport = [];

for (const cls of classes) {
    for (const file of files) {
        const src = readFileSync(file, 'utf8');
        let next = src;
        if (file.endsWith('.hbs')) {
            const [t, n] = rewriteTemplate(next, cls);
            if (n > 0) {
                next = t;
                totalTemplate += n;
                consumerReport.push(`  template ${file}  ${cls} → data-wh40k-hook="${hookId(cls)}" (${n}×)`);
            }
        }
        const [c, sites] = rewriteConsumer(next, cls);
        if (sites.length > 0) {
            next = c;
            consumerReport.push(`  REVIEW   ${file}:${sites.join(',')}  selector .${cls} → [data-wh40k-hook="${hookId(cls)}"]`);
        }
        if (next !== src && !dry) writeFileSync(file, next);
    }
}

for (const line of consumerReport) console.log(line);
console.log(`\n${classes.length} hook(s); ${totalTemplate} class-attribute rewrite(s).`);
console.log('Every REVIEW line is a consumer whose selector now depends on the attribute — confirm it asserts the element EXISTS.');
if (dry) console.log('(dry run — nothing written)');
