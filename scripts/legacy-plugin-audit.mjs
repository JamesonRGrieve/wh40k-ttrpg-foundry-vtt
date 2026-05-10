#!/usr/bin/env node
/**
 * Audit `tailwind/*.js` plugin files for dead rules — selectors that no
 * template, module file, test, or story references. These are migration debt
 * that survived the explode pass without a live consumer.
 *
 * Walks each plugin's exported object recursively (top-level AND nested),
 * extracting every `wh40k-*` class token from each selector key. A rule is
 * "dead" when none of its tokens appear (delimited) in src/templates/**.hbs,
 * src/module/**.{ts,js}, tests/**, or stories/**. Selectors with zero
 * `wh40k-*` tokens are skipped — they target Foundry-managed elements
 * (`body.theme-dark`, `.window-content`, `#tooltip`, etc.) rather than
 * authored class names.
 *
 * Hard gate: exits non-zero when any dead rule is present. New dead rules
 * should be deleted, not allowed to accumulate; the dedup behaviour of
 * `addBase` means a "dead-by-cascade" rule still costs build cycles AND
 * silently shadows live rules (see `tailwind/design-tokens.js` comment for
 * one variant of this trap). Running this in pre-commit catches the
 * regression at write time.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = resolve(process.cwd());
const PLUGINS = readdirSync(resolve(ROOT, 'tailwind'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();

function walk(dir, exts) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full, exts));
        else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
    return out;
}

const sources = [
    ...walk(resolve(ROOT, 'src/templates'), ['.hbs']),
    ...walk(resolve(ROOT, 'src/module'), ['.ts', '.js']),
    ...walk(resolve(ROOT, 'tests'), ['.ts', '.js']),
    ...walk(resolve(ROOT, 'stories'), ['.ts', '.js']),
];
const haystack = sources.map((p) => readFileSync(p, 'utf8')).join('\n');

const CLASS_RE = /wh40k-[A-Za-z0-9_-]+(?:__[A-Za-z0-9_-]+)?/g;

function isUsed(classes) {
    return classes.some((c) => {
        // Match the class only when it's NOT followed by another class-name char
        // (letter/digit/hyphen/underscore). Plain `haystack.includes('wh40k-panel')`
        // would falsely match `wh40k-panel-header`.
        const re = new RegExp(`${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
        return re.test(haystack);
    });
}

// Recursively walk a CSS-in-JS object. Each KEY whose value is an object is a
// selector (possibly with `&`). Properties (string/number values) aren't
// selectors and don't get audited. The selector path is built by concatenating
// keys, replacing `&` with the parent — but for *deadness*, we only need to
// check the most-specific token sequence in the path: a descendant selector
// like `.wh40k-foo .wh40k-bar` is only live if BOTH classes appear. Tracking
// this conservatively: a rule is dead only when the LEAF selector's classes
// are dead AND no ancestor's classes overlap with live consumers either.
//
// In practice the simplest correct rule is: a rule is dead iff every
// `wh40k-*` token along its full selector path is unused. If any single
// token is used, leave the rule (a parent might be live and the child is a
// child-rule that's still meaningful).
function classesOf(sel) {
    return [...new Set(sel.match(CLASS_RE) ?? [])];
}

function auditObject(obj, path, dead) {
    for (const [key, val] of Object.entries(obj)) {
        if (val == null || typeof val !== 'object' || Array.isArray(val)) continue;
        // Skip at-rule wrappers (@media, @layer, @supports). They're plumbing,
        // not selectors.
        if (key.startsWith('@')) {
            auditObject(val, path, dead);
            continue;
        }
        const newPath = [...path, key];
        const allClasses = newPath.flatMap(classesOf);
        // Rule has no wh40k-* anywhere — Foundry-managed selector, skip.
        if (allClasses.length === 0) {
            auditObject(val, newPath, dead);
            continue;
        }
        if (!isUsed(allClasses)) {
            dead.push(newPath.join(' › '));
        }
        auditObject(val, newPath, dead);
    }
}

let totalDead = 0;
for (const name of PLUGINS) {
    const obj = require(resolve(ROOT, 'tailwind', `${name}.js`));
    const dead = [];
    auditObject(obj, [], dead);
    if (dead.length > 0) {
        console.log(`\n[${name}] ${dead.length} dead selector${dead.length === 1 ? '' : 's'}:`);
        for (const sel of dead) {
            console.log(`  - ${sel}`);
        }
        totalDead += dead.length;
    }
}

if (totalDead > 0) {
    console.log(
        `\n[summary] ${totalDead} dead selector${totalDead === 1 ? '' : 's'}.\n` +
            `Delete the dead block(s) — every wh40k-* class along the selector path is absent from templates/modules/tests/stories.`,
    );
    process.exit(1);
}

console.log('[plugin-audit] no dead rules.');
process.exit(0);
