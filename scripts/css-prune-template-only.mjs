#!/usr/bin/env node
/**
 * Stricter prune: a class is live ONLY if it appears in a Handlebars
 * `class="…"` attribute or is added via known JS class-setting APIs in
 * src/module. JS lookups (`querySelector('.wh40k-foo')`, etc.) do NOT
 * count as live — if no template emits the class, the lookup never finds
 * anything and the CSS rule is unreachable.
 *
 * This catches rules like `.wh40k-toggle-equipped` whose only JS hit is a
 * `querySelectorAll` call against templates that no longer render the class.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';

const ROOT = resolve(process.cwd());
const MONOLITH = resolve(ROOT, 'src/css/wh40k-rpg.css');
const dryRun = process.argv.includes('--dry');

const live = new Set();

// 1. Templates: every token inside class="…" / class='…'
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
    // 1a. Direct class="..." attributes (and JSX-style className=)
    for (const m of c.matchAll(/class(?:Name)?\s*=\s*"([^"]*)"/g)) {
        for (const t of m[1].split(/\s+/)) if (t.startsWith('wh40k-')) live.add(t);
    }
    for (const m of c.matchAll(/class(?:Name)?\s*=\s*'([^']*)'/g)) {
        for (const t of m[1].split(/\s+/)) if (t.startsWith('wh40k-')) live.add(t);
    }
    // 1b. Handlebars partial parameters: anything ending in "Class=...":
    //     rootClass="wh40k-foo", headerClass='wh40k-bar tw-baz', cardClass="wh40k-baz", etc.
    //     Also generic attrs: rootClass=, bodyClass=, contentClass=, badgeClass=, panelClass=…
    for (const m of c.matchAll(/[A-Za-z]+Class\s*=\s*"([^"]*)"/g)) {
        for (const t of m[1].split(/\s+/)) if (t.startsWith('wh40k-')) live.add(t);
    }
    for (const m of c.matchAll(/[A-Za-z]+Class\s*=\s*'([^']*)'/g)) {
        for (const t of m[1].split(/\s+/)) if (t.startsWith('wh40k-')) live.add(t);
    }
    // 1c. Any wh40k-* token anywhere in the template — covers BEM-suffix
    //     dynamic constructions like `wh40k-iconic-stat--ammo-{{state}}`
    //     and aliased usages we'd otherwise miss. Comments are tolerated as
    //     live; dead-class regression is more expensive than keeping a few
    //     stray rules.
    for (const m of c.matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(m[1]);
}

// 2. Module code: classes added via classes:[…], className=, classList.add('…'),
//    setAttribute('class', '…'), or as values inside template-literal class strings.
//    We are lenient here and grab any `wh40k-*` token inside a string literal.
const CLASS_SETTING_PATTERNS = [
    /classes\s*:\s*\[([^\]]+)\]/g,
    /className\s*[+]?=\s*([`'"][^`'"]+[`'"])/g,
    /classList\.add\(([^)]+)\)/g,
    /setAttribute\(\s*['"]class['"]\s*,\s*([`'"][^`'"]+[`'"])\s*\)/g,
    /class\s*=\s*\\?["']([^"']*)\\?["']/g, // chat-card HTML strings
];
for (const f of walk(resolve(ROOT, 'src/module'), /\.(ts|js|mjs)$/)) {
    const c = readFileSync(f, 'utf8');
    for (const re of CLASS_SETTING_PATTERNS) {
        for (const m of c.matchAll(re)) {
            const blob = m[1] ?? '';
            for (const tm of blob.matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
        }
    }
    // Also: any wh40k-* inside a template literal — covers innerHTML strings,
    // Foundry chat-message renderers, etc.
    for (const m of c.matchAll(/`([^`]*)`/g)) {
        for (const tm of m[1].matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(tm[1]);
    }
}

// 3. Dynamic-resolved classes — keep all plausible ones
const itemTypes = ['weapon', 'armour', 'gear', 'trait', 'skill', 'psychic-power', 'talent', 'origin-path', 'cybernetic', 'peer-enemy', 'attack-special', 'journal-entry', 'ammo', 'force-field', 'weapon-mod', 'critical-injury', 'storage-location', 'ship-weapon', 'ship-component', 'ship-upgrade', 'npc-template'];
for (const t of itemTypes) live.add(`wh40k-${t}-sheet`);
const vitalKeys = ['wounds', 'fatigue', 'fate', 'experience', 'mobility', 'corruption', 'insanity'];
for (const k of vitalKeys) live.add(`wh40k-${k}-badge`);

console.log(`Live (template-driven): ${live.size}`);
writeFileSync(resolve(ROOT, '/tmp/live-strict.json'), JSON.stringify([...live].sort(), null, 2));

const SELECTOR_CLASS_RE = /\.(wh40k-[a-zA-Z0-9_-]+)/g;

// Build a list of dynamic prefixes — tokens captured from templates that end
// in `-` because the source had `{{...}}` after the hyphen (e.g.
// `wh40k-iconic-stat--ammo-{{system.ammoStatus}}` captures the prefix
// `wh40k-iconic-stat--ammo-`). Any defined class starting with such a prefix
// is treated as live regardless of suffix.
const dynamicPrefixes = [...live].filter((t) => t.endsWith('-'));

function isClassLive(c) {
    if (live.has(c)) return true;
    return dynamicPrefixes.some((p) => c.startsWith(p));
}

function isSelectorLive(selector) {
    const classes = [...selector.matchAll(SELECTOR_CLASS_RE)].map((m) => m[1]);
    if (classes.length === 0) return true;
    return classes.every(isClassLive);
}

/**
 * Resolve nested `&` selectors against the parent's resolved selectors and
 * return the list of fully-qualified selectors a rule produces. Handles the
 * common postcss-nested patterns: `&--foo`, `&__foo`, `&:hover`, `&.bar`,
 * `& .descendant`, plain `.descendant`, multi-comma selectors, and arbitrary
 * nesting depth. Returns the array of expanded selectors for `node`.
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

/**
 * A rule is preserved if any of its expanded selectors is live. This keeps
 * the parent rule even when its bare class is unused but at least one
 * BEM modifier (`&--foo`) is referenced.
 */
function ruleHasAnyLiveExpansion(node) {
    const expanded = expandSelectors(node);
    if (expanded.some(isSelectorLive)) return true;
    // If any descendant rule has a live expansion, keep the parent.
    let found = false;
    node.walkRules((child) => {
        if (found) return false;
        if (expandSelectors(child).some(isSelectorLive)) {
            found = true;
            return false;
        }
    });
    return found;
}

const removed = [];
const sourceMarkers = [];
function buildSourceMarkers(content) {
    const lines = content.split('\n');
    const re = /^\/\* ── source: (.+?) ── \*\//;
    lines.forEach((l, i) => {
        const m = l.match(re);
        if (m) sourceMarkers.push({ line: i + 1, source: m[1] });
    });
    sourceMarkers.push({ line: lines.length + 1, source: '__end__' });
}
function locateSource(node) {
    const line = node.source?.start?.line ?? -1;
    if (line < 0) return null;
    for (let i = 0; i < sourceMarkers.length - 1; i++) {
        if (line >= sourceMarkers[i].line && line < sourceMarkers[i + 1].line) {
            return sourceMarkers[i].source;
        }
    }
    return null;
}

function processNode(node) {
    if (node.type === 'rule') {
        if (node.parent && node.parent.type === 'atrule' && /keyframes/i.test(node.parent.name)) return;
        // Use full-expansion liveness (handles postcss-nested `&--foo` etc.)
        if (!ruleHasAnyLiveExpansion(node)) {
            removed.push({ selector: node.selector, source: locateSource(node) });
            node.remove();
            return;
        }
        // For comma-separated top-level selectors, drop the dead branches but
        // only when all expansions of a branch are dead. We compute per-branch.
        const parts = node.selector.split(/\s*,\s*/);
        if (parts.length > 1) {
            const liveParts = [];
            for (const p of parts) {
                // Build a tentative selector with just this branch and check liveness
                // including nested-rule expansions
                const saved = node.selector;
                node.selector = p;
                if (ruleHasAnyLiveExpansion(node)) liveParts.push(p);
                node.selector = saved;
            }
            if (liveParts.length && liveParts.length !== parts.length) {
                removed.push({ partial: parts.filter((p) => !liveParts.includes(p)), kept: liveParts, source: locateSource(node) });
                node.selector = liveParts.join(',\n');
            }
        }
        node.each((child) => processNode(child));
    } else if (node.type === 'atrule') {
        if (/^(media|supports|layer|container)$/i.test(node.name)) {
            node.each((child) => processNode(child));
            if (node.nodes && node.nodes.length === 0) {
                removed.push({ atrule: `@${node.name} ${node.params}` });
                node.remove();
            }
        }
    }
}

const original = readFileSync(MONOLITH, 'utf8');
buildSourceMarkers(original);
const root = postcss.parse(original);
root.each((node) => processNode(node));
const out = root.toResult().css;

const summary = { originalLines: original.split('\n').length, newLines: out.split('\n').length, rulesRemoved: removed.length, bySource: {} };
for (const r of removed) {
    const s = r.source ?? '__inline__';
    summary.bySource[s] = (summary.bySource[s] ?? 0) + 1;
}
console.log(`Original: ${summary.originalLines} lines`);
console.log(`Pruned:   ${summary.newLines} lines  (Δ -${summary.originalLines - summary.newLines})`);
console.log(`Rules removed: ${summary.rulesRemoved}`);
console.log('By source:');
for (const [src, n] of Object.entries(summary.bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${src}: ${n}`);

if (!dryRun) {
    writeFileSync(MONOLITH, out, 'utf8');
    writeFileSync(resolve(ROOT, '.css-prune-template-manifest.json'), JSON.stringify({ summary, removed }, null, 2));
}
