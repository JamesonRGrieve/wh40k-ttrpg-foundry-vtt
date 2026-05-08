#!/usr/bin/env node
/**
 * Prune orphan CSS custom properties (`--wh40k-*`) from the monolith.
 *
 * A variable is orphan if no `var(--name)` reference exists in:
 *   - the monolith itself
 *   - tailwind.config.js
 *   - any src/templates/**.hbs
 *   - any src/module/**.{ts,js,mjs}
 *
 * Orphan variables are removed by deleting the matching declaration node
 * from any rule (`:root`, `body.theme-dark`, etc.) where they appear.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';

const ROOT = resolve(process.cwd());
const MONOLITH = resolve(ROOT, 'src/css/wh40k-rpg.css');
const dryRun = process.argv.includes('--dry');

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '.foundry-release' || name.startsWith('.git')) continue;
        const full = `${dir}/${name}`;
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) yield* walk(full);
        else yield full;
    }
}

const original = readFileSync(MONOLITH, 'utf8');

// Defined vars
const defined = new Set();
for (const m of original.matchAll(/--(wh40k-[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);

// Build a usage corpus
const blobs = [original, readFileSync(resolve(ROOT, 'tailwind.config.js'), 'utf8')];
for (const f of walk(resolve(ROOT, 'src/templates'))) if (f.endsWith('.hbs')) blobs.push(readFileSync(f, 'utf8'));
for (const f of walk(resolve(ROOT, 'src/module'))) if (/\.(ts|js|mjs)$/.test(f)) blobs.push(readFileSync(f, 'utf8'));
const blob = blobs.join('\n');

const orphan = new Set();
for (const v of defined) {
    // Match `var(--name)` OR a bare `--name` reference that isn't followed by a definition `:`
    const re = new RegExp(`var\\(\\s*--${v}\\b|(?<!--)--${v}(?!\\s*:)`, 'g');
    const hits = blob.match(re) || [];
    if (hits.length === 0) orphan.add(v);
}
console.log(`Defined CSS vars: ${defined.size}`);
console.log(`Orphan vars: ${orphan.size}`);

const root = postcss.parse(original);
let removed = 0;
root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--wh40k-')) return;
    const name = decl.prop.slice(2);
    if (orphan.has(name)) {
        decl.remove();
        removed++;
    }
});

const out = root.toResult().css;
console.log(`Removed declarations: ${removed}`);
console.log(`Lines: ${original.split('\n').length} → ${out.split('\n').length}  (Δ -${original.split('\n').length - out.split('\n').length})`);

if (!dryRun) {
    writeFileSync(MONOLITH, out, 'utf8');
    writeFileSync(resolve(ROOT, '.css-prune-vars-manifest.json'), JSON.stringify({ orphans: [...orphan].sort(), removed }, null, 2));
}
