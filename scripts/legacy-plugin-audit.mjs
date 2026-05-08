#!/usr/bin/env node
/**
 * Audit `tailwind/*.js` plugin files for dead rules — top-level selectors
 * that no template or module file references. These are migration debt that
 * survived the explode pass without a live consumer.
 *
 * For each top-level key in each plugin's exported object, extract the
 * `wh40k-*` class names from the selector string and verify at least one
 * appears in `src/templates/**`.hbs or `src/module/**`.{ts,js}. Top-level
 * selectors with no `wh40k-*` token (e.g. `#tooltip.wh40k-tooltip` itself,
 * or rules like `body.theme-dark`) are skipped — they target Foundry-managed
 * elements rather than authored class names.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = resolve(process.cwd());
const PLUGINS = [
    'panel-components',
    'legacy-components',
    'item-preview',
    'wh40k-tooltip',
    'compendium-browser',
    'npc-sheet',
    'foundry-chrome',
    'weapon',
];

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

let totalDead = 0;
let totalChecked = 0;
for (const name of PLUGINS) {
    const obj = require(resolve(ROOT, 'tailwind', `${name}.js`));
    const dead = [];
    for (const sel of Object.keys(obj)) {
        const classes = sel.match(CLASS_RE) ?? [];
        if (classes.length === 0) continue;
        totalChecked++;
        const used = classes.some((c) => {
            // Match the class name only when it is NOT followed by another
            // class-name char (letter, digit, hyphen, underscore). Plain
            // `haystack.includes('wh40k-panel')` would falsely match
            // `wh40k-panel-header`. We allow any other char (or end-of-string)
            // as the trailing boundary.
            const re = new RegExp(`${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?![A-Za-z0-9_-])`);
            return re.test(haystack);
        });
        if (!used) {
            dead.push({ selector: sel, classes });
            totalDead++;
        }
    }
    if (dead.length > 0) {
        console.log(`\n[${name}] ${dead.length} dead top-level selector${dead.length === 1 ? '' : 's'}:`);
        for (const d of dead) {
            console.log(`  - ${d.selector}`);
        }
    }
}

console.log(`\n[summary] ${totalDead} dead / ${totalChecked} checked top-level selectors with wh40k-* classes.`);
process.exit(totalDead === 0 ? 0 : 1);
