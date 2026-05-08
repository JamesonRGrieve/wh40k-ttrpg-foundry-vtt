#!/usr/bin/env node
/**
 * Aggressive prune: walk every rule (top-level AND nested), fully expand
 * postcss-nested `&` syntax to absolute selectors, and check whether any
 * absolute selector targets a real `.wh40k-*` class that templates emit.
 *
 * If no expanded selector is live, drop the rule.
 *
 * Different from `css-prune-template-only.mjs`:
 *   - That pruner walks top-level rules and asks "does this rule have any
 *     live expansion in its descendants?" — but it only fully expands the
 *     immediate rule's own postcss-nested `&` notation, not arbitrary
 *     nesting. Nested rules that resolve to a still-dead class survive
 *     because their parent rule had at least one live descendant.
 *
 *   - This pruner walks ALL rules and asks each independently. A nested
 *     rule whose expansion is dead is removed, even if a sibling rule
 *     under the same parent is live.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';

const ROOT = resolve(process.cwd());
const MONOLITH = resolve(ROOT, 'src/css/wh40k-rpg.css');
const dryRun = process.argv.includes('--dry');

// --- LIVE set ---
const live = new Set();
function* walk(dir, exts) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '.foundry-release' || name.startsWith('.git')) continue;
        const full = `${dir}/${name}`;
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) yield* walk(full, exts);
        else if (exts.test(name)) yield full;
    }
}

for (const f of walk(resolve(ROOT, 'src/templates'), /\.hbs$/)) {
    const c = readFileSync(f, 'utf8');
    for (const m of c.matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(m[1]);
}
for (const f of walk(resolve(ROOT, 'src/module'), /\.(ts|js|mjs)$/)) {
    const c = readFileSync(f, 'utf8');
    // Only consider class-setting strings, not querySelector targets — but
    // be lenient with template literals
    for (const m of c.matchAll(/classes\s*:\s*\[([^\]]+)\]/g)) {
        for (const tm of m[1].matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
    }
    for (const m of c.matchAll(/className\s*[+]?=\s*[`'"]([^`'"]+)[`'"]/g)) {
        for (const tm of m[1].matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
    }
    for (const m of c.matchAll(/classList\.add\(([^)]+)\)/g)) {
        for (const tm of m[1].matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
    }
    for (const m of c.matchAll(/`([^`]*)`/g)) {
        for (const tm of m[1].matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
    }
}

const itemTypes = ['weapon', 'armour', 'gear', 'trait', 'skill', 'psychic-power', 'talent', 'origin-path', 'cybernetic', 'peer-enemy', 'attack-special', 'journal-entry', 'ammo', 'force-field', 'weapon-mod', 'critical-injury', 'storage-location', 'ship-weapon', 'ship-component', 'ship-upgrade', 'npc-template'];
for (const t of itemTypes) live.add(`wh40k-${t}-sheet`);
const vitalKeys = ['wounds', 'fatigue', 'fate', 'experience', 'mobility', 'corruption', 'insanity'];
for (const k of vitalKeys) live.add(`wh40k-${k}-badge`);

const dynamicPrefixes = [...live].filter((t) => t.endsWith('-'));
function isClassLive(c) {
    if (live.has(c)) return true;
    return dynamicPrefixes.some((p) => c.startsWith(p));
}
function isSelectorLive(selector) {
    const classes = [...selector.matchAll(/\.(wh40k-[a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    if (classes.length === 0) return true; // chrome / element-only
    return classes.every(isClassLive);
}

/**
 * Expand a rule node's selector, walking up through any rule parents and
 * substituting `&`. Returns the absolute (top-level) selectors.
 */
function expandSelectors(node) {
    const own = node.selector.split(/\s*,\s*/);
    let parents = [''];
    if (node.parent && node.parent.type === 'rule') parents = expandSelectors(node.parent);
    const out = [];
    for (const p of parents) {
        for (const o of own) {
            if (!p) {
                out.push(o);
            } else if (o.startsWith('&')) {
                out.push(p + o.slice(1));
            } else {
                out.push(`${p} ${o}`);
            }
        }
    }
    return out;
}

const original = readFileSync(MONOLITH, 'utf8');
const root = postcss.parse(original);

let removed = 0;
let removedLines = 0;

// Walk depth-first so nested rules are visited first; remove from leaves up.
function processRule(rule) {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    // Process children first
    const children = [...rule.nodes].filter((n) => n.type === 'rule');
    for (const c of children) processRule(c);
    // Now check this rule
    const exp = expandSelectors(rule);
    const liveExp = exp.filter(isSelectorLive);
    if (liveExp.length === 0) {
        const startL = rule.source?.start?.line ?? 0;
        const endL = rule.source?.end?.line ?? 0;
        removedLines += endL - startL + 1;
        removed++;
        rule.remove();
    }
}

root.each((node) => {
    if (node.type === 'rule') processRule(node);
    else if (node.type === 'atrule' && /^(media|supports|layer|container)$/i.test(node.name)) {
        node.walkRules(processRule);
        if (node.nodes.length === 0) {
            const startL = node.source?.start?.line ?? 0;
            const endL = node.source?.end?.line ?? 0;
            removedLines += endL - startL + 1;
            node.remove();
        }
    }
});

const out = root.toResult().css;
console.log(`Live tokens: ${live.size}`);
console.log(`Rules removed: ${removed}`);
console.log(`Original: ${original.split('\n').length} lines`);
console.log(`Pruned:   ${out.split('\n').length} lines  (Δ -${original.split('\n').length - out.split('\n').length})`);

if (!dryRun) {
    writeFileSync(MONOLITH, out, 'utf8');
}
