#!/usr/bin/env node
/**
 * For every class token that keeps a template in the `mixed` bucket, report
 * where that token is actually *used* outside the template:
 *
 *   css     — a selector in tailwind/*.js (or src/css/**.css) matches it, so the
 *             token carries real styling and porting it means moving those
 *             declarations onto the template as `tw-*` utilities.
 *   foundry — FOUNDRY's own stylesheet styles it. Generic names like `bright`,
 *             `divider`, `framed` and `empty` belong to Foundry's element
 *             library (`button.bright`, `h1.divider`), so a token with no rule in
 *             OUR css is still load-bearing and deleting it is a silent visual
 *             regression. Requires `.foundry-release/`; without it this category
 *             cannot be computed and the scan says so rather than guessing.
 *   js      — src/module/**.ts references it (querySelector / classList / a
 *             DEFAULT_OPTIONS classes array), so it is a live runtime hook.
 *   test    — tests/**, stories/** or a CO-LOCATED src/templates/**\/*.stories.ts
 *             references it, so it is an assertion target.
 *   param   — a sibling template passes it as a Handlebars HASH PARAMETER
 *             (`{{> vital-inline-row rowClass="wh40k-mental-row"}}`), so it reaches
 *             rendered DOM without ever appearing in a `class="…"` attribute.
 *   dead    — nothing anywhere references it. The class name is a decorative
 *             BEM identifier with no backing rule and no consumer: deleting it
 *             from the template is a no-op.
 *
 * The `js` / `test` / `param` probes are whole-WORD matches, so a class whose name
 * is an ordinary English word can be claimed by something unrelated — `framed`
 * reports as a hook purely because a Tier B spec has a local `const framed` and a
 * story comment says "framed under each of the 7 systems". That bias is deliberate:
 * a false positive keeps a class, a false negative deletes one. Treat `dead` as
 * trustworthy and the hook categories as an upper bound; confirm by eye before
 * concluding a short-named class is load-bearing.
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
// Foundry's compiled stylesheet, when the licensed mirror is present. It claims a
// lot of unprefixed class names (button.bright, h1.divider, .framed, .highlight),
// so a token absent from OUR css can still be styled — treating it as dead and
// deleting it silently changes rendering. Absence of the mirror is reported, not
// silently treated as "no Foundry rule".
const FOUNDRY_CSS = '.foundry-release/public/css/foundry2.css';
let foundryHaystack = '';
let foundryAvailable = true;
try {
    foundryHaystack = readFileSync(FOUNDRY_CSS, 'utf8');
} catch {
    foundryAvailable = false;
}
const jsHaystack = readAll('src/module', ['.ts', '.js']);
// Stories/tests live BOTH in `stories/` + `tests/` and co-located beside the
// template as `src/templates/**/*.stories.ts`. Reading only the former misses the
// latter and mislabels an asserted-on class as dead.
const testHaystack = readAll('tests', ['.ts', '.js']) + readAll('stories', ['.ts', '.js']) + readAll('src/templates', ['.stories.ts', '.test.ts']);
// A class can reach rendered DOM as a Handlebars HASH PARAMETER rather than a
// literal class attribute — `{{> vital-inline-row rowClass="wh40k-mental-row"}}`.
// The coverage scanner only reads `class="…"`, so such a token looks unused while
// a sibling template is actively passing it in.
const paramHaystack = (() => {
    let out = '';
    for (const f of walkFiles('src/templates', { ext: '.hbs' })) {
        for (const expr of readFileSync(f, 'utf8').matchAll(/\{\{[^}]*\}\}/g)) {
            for (const p of expr[0].matchAll(/[\w-]+\s*=\s*"([^"]*)"/g)) out += `${p[1]}\n`;
        }
    }
    return out;
})();
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
                foundry: hasSelector(foundryHaystack, t),
                variant: hasSelector(variantHaystack, t),
                js: hasWord(jsHaystack, t),
                test: hasWord(testHaystack, t),
                param: hasWord(paramHaystack, t),
                files: [],
            });
        }
        tokenInfo.get(t).files.push(rel);
    }
}

const kindOf = (i) => (i.css ? 'css' : i.foundry ? 'foundry' : i.variant ? 'variant' : i.js ? 'js' : i.test ? 'test' : i.param ? 'param' : 'dead');

if (byFiles) {
    for (const [file, bad] of templates) {
        const kinds = bad.map((t) => `${t}[${kindOf(tokenInfo.get(t))}]`);
        const worst = bad.some((t) => tokenInfo.get(t).css || tokenInfo.get(t).foundry || tokenInfo.get(t).variant)
            ? 'CSS-BACKED'
            : bad.some((t) => tokenInfo.get(t).js || tokenInfo.get(t).test || tokenInfo.get(t).param)
            ? 'HOOK-ONLY'
            : 'ALL-DEAD';
        console.log(`${worst}  ${file}\n    ${kinds.join(' ')}`);
    }
} else {
    const rows = [...tokenInfo.entries()].sort((a, b) => kindOf(a[1]).localeCompare(kindOf(b[1])) || a[0].localeCompare(b[0]));
    for (const [t, i] of rows) console.log(`${kindOf(i).padEnd(5)} ${String(i.files.length).padStart(3)}  ${t}`);
}

const tally = { css: 0, foundry: 0, variant: 0, js: 0, test: 0, param: 0, dead: 0 };
for (const i of tokenInfo.values()) tally[kindOf(i)]++;
const fileTally = { 'CSS-BACKED': 0, 'HOOK-ONLY': 0, 'ALL-DEAD': 0 };
for (const [, bad] of templates) {
    if (bad.some((t) => tokenInfo.get(t).css || tokenInfo.get(t).foundry || tokenInfo.get(t).variant)) fileTally['CSS-BACKED']++;
    else if (bad.some((t) => tokenInfo.get(t).js || tokenInfo.get(t).test || tokenInfo.get(t).param)) fileTally['HOOK-ONLY']++;
    else fileTally['ALL-DEAD']++;
}
console.log(`\ntokens: ${JSON.stringify(tally)}`);
console.log(`templates: ${JSON.stringify(fileTally)}`);
if (!foundryAvailable) {
    console.log(
        `WARNING: ${FOUNDRY_CSS} is absent, so the \`foundry\` category could not be computed.\n` +
            'Run ./pull-foundry.sh before trusting any token classified `dead` — generic names\n' +
            'like `bright` / `divider` / `framed` are styled by Foundry, not by this repo.',
    );
}
