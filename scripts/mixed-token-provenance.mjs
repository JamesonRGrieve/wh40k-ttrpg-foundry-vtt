#!/usr/bin/env node
/**
 * For every class token that keeps a template in the `mixed` bucket, report
 * where that token is actually *used* outside the template:
 *
 *   css   — a selector in tailwind/*.js (or src/css/**.css) matches it, so the
 *           token carries real styling and porting it means moving those
 *           declarations onto the template as `tw-*` utilities.
 *   js    — src/module/**.ts references it (querySelector / classList / a
 *           DEFAULT_OPTIONS classes array), so it is a live runtime hook.
 *   test  — tests/** or stories/** references it, so it is an assertion target.
 *   dead  — nothing anywhere references it. The class name is a decorative
 *           BEM identifier with no backing rule and no consumer: deleting it
 *           from the template is a no-op.
 *
 * Usage:
 *   node scripts/mixed-token-provenance.mjs            # per-token table
 *   node scripts/mixed-token-provenance.mjs --files    # group by template
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { walkFiles } from './lib/walk.mjs';
import { classifyFile, offendingTokens } from './lib/css-classify.mjs';

const byFiles = process.argv.includes('--files');

function readAll(dir, ext) {
    let out = '';
    for (const f of walkFiles(dir, { ext })) out += readFileSync(f, 'utf8');
    return out;
}

const cssHaystack = readAll('tailwind', '.js') + readAll('src/css', '.css');
const jsHaystack = readAll('src/module', ['.ts', '.js']);
const testHaystack = readAll('tests', ['.ts', '.js']) + readAll('stories', ['.ts', '.js']);
// Templates can style each other's class names without any CSS file: a parent
// element carries a Tailwind arbitrary variant (`[&_.wh40k-foo]:tw-hidden`,
// `[&:has(.wh40k-bar)]:tw-flex`) whose selector names a descendant's class. Such
// a class IS load-bearing even though nothing in tailwind/*.js mentions it, so
// the arbitrary-variant brackets across every template form a fourth haystack.
const variantHaystack = (() => {
    let out = '';
    for (const f of walkFiles('src/templates', { ext: '.hbs' })) {
        for (const m of readFileSync(f, 'utf8').matchAll(/\[[^\]\s]*&[^\]]*\]/g)) out += `${m[0]}\n`;
    }
    return out;
})();

/** Escape a class token for embedding in a RegExp source. */
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when `token` appears in `haystack` as a CSS selector — i.e. `.token`
 * not immediately followed by another class-name character. A bare substring
 * test would match `wh40k-rpg` inside `.wh40k-rpg.sheet.actor` and every
 * `wh40k-loot` inside `wh40k-loot-list`, so the boundary is load-bearing.
 */
const hasSelector = (haystack, token) => new RegExp(`\\.${esc(token)}(?![\\w-])`).test(haystack);

/** True when `token` appears in `haystack` as a standalone word. */
const hasWord = (haystack, token) => new RegExp(`(?<![\\w-])${esc(token)}(?![\\w-])`).test(haystack);

const templates = [];
const tokenInfo = new Map();

for (const file of walkFiles(resolve(process.cwd(), 'src/templates'), { ext: '.hbs' })) {
    const src = readFileSync(file, 'utf8');
    if (classifyFile(src) !== 'mixed') continue;
    const rel = relative(process.cwd(), file);
    const bad = offendingTokens(src);
    templates.push([rel, bad]);
    for (const t of bad) {
        if (!tokenInfo.has(t)) {
            tokenInfo.set(t, {
                css: hasSelector(cssHaystack, t),
                variant: hasSelector(variantHaystack, t),
                js: hasWord(jsHaystack, t),
                test: hasWord(testHaystack, t),
                files: [],
            });
        }
        tokenInfo.get(t).files.push(rel);
    }
}

const kindOf = (i) => (i.css ? 'css' : i.variant ? 'variant' : i.js ? 'js' : i.test ? 'test' : 'dead');

if (byFiles) {
    for (const [file, bad] of templates) {
        const kinds = bad.map((t) => `${t}[${kindOf(tokenInfo.get(t))}]`);
        const worst = bad.some((t) => tokenInfo.get(t).css || tokenInfo.get(t).variant)
            ? 'CSS-BACKED'
            : bad.some((t) => tokenInfo.get(t).js || tokenInfo.get(t).test)
            ? 'HOOK-ONLY'
            : 'ALL-DEAD';
        console.log(`${worst}  ${file}\n    ${kinds.join(' ')}`);
    }
} else {
    const rows = [...tokenInfo.entries()].sort((a, b) => kindOf(a[1]).localeCompare(kindOf(b[1])) || a[0].localeCompare(b[0]));
    for (const [t, i] of rows) console.log(`${kindOf(i).padEnd(5)} ${String(i.files.length).padStart(3)}  ${t}`);
}

const tally = { css: 0, variant: 0, js: 0, test: 0, dead: 0 };
for (const i of tokenInfo.values()) tally[kindOf(i)]++;
const fileTally = { 'CSS-BACKED': 0, 'HOOK-ONLY': 0, 'ALL-DEAD': 0 };
for (const [, bad] of templates) {
    if (bad.some((t) => tokenInfo.get(t).css || tokenInfo.get(t).variant)) fileTally['CSS-BACKED']++;
    else if (bad.some((t) => tokenInfo.get(t).js || tokenInfo.get(t).test)) fileTally['HOOK-ONLY']++;
    else fileTally['ALL-DEAD']++;
}
console.log(`\ntokens: ${JSON.stringify(tally)}`);
console.log(`templates: ${JSON.stringify(fileTally)}`);
