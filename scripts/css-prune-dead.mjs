#!/usr/bin/env node
/**
 * Prune rules from src/css/wh40k-rpg.css whose selectors only target classes
 * that are not referenced anywhere in the rest of the codebase.
 *
 * Algorithm:
 *   1. Scan src/, stories/, scripts/, tests/, .storybook/, tailwind.config.js
 *      for any token of the form `wh40k-*` — that's the LIVE set.
 *   2. Parse src/css/wh40k-rpg.css with postcss (no plugins; preserves nested
 *      syntax verbatim).
 *   3. Walk every rule. For each comma-separated selector in the rule, ask:
 *        - does it reference any `.wh40k-*` class? If not, it targets Foundry
 *          chrome / generic elements — keep it.
 *        - if yes, is EVERY referenced `.wh40k-*` class in the LIVE set? Keep.
 *        - otherwise the selector is unreachable — drop it.
 *      If all selectors were dropped, remove the rule entirely.
 *   4. Walk @keyframes, @media, @supports, @layer the same way.
 *   5. Write back. Also write a JSON manifest of what was removed.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';

const ROOT = resolve(process.cwd());
const MONOLITH = resolve(ROOT, 'src/css/wh40k-rpg.css');

const dryRun = process.argv.includes('--dry');

// --- LIVE set ---
const live = new Set();
function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'css' || name === 'node_modules' || name === 'dist' || name === '.foundry-release') continue;
        if (name.startsWith('.git')) continue;
        const full = `${dir}/${name}`;
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) yield* walk(full);
        else if (/\.(hbs|ts|js|mjs|tsx|jsx|json|html|md|cjs)$/.test(name)) yield full;
    }
}
const roots = ['src', 'stories', 'scripts', 'tests', 'tailwind.config.js', '.storybook'];
for (const r of roots) {
    try {
        const p = resolve(ROOT, r);
        const st = statSync(p);
        if (st.isDirectory()) {
            for (const f of walk(p)) {
                const c = readFileSync(f, 'utf8');
                for (const m of c.matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(m[1]);
            }
        } else {
            const c = readFileSync(p, 'utf8');
            for (const m of c.matchAll(/(wh40k-[a-zA-Z0-9_-]+)/g)) live.add(m[1]);
        }
    } catch {}
}

// Treat dynamic-resolved classes as live to be safe:
//   `wh40k-{{item.type}}-sheet` → wh40k-<itemType>-sheet
//   `wh40k-{{key}}-badge` → wh40k-<key>-badge
const itemTypes = [
    'weapon',
    'armour',
    'gear',
    'trait',
    'skill',
    'psychic-power',
    'talent',
    'origin-path',
    'cybernetic',
    'peer-enemy',
    'attack-special',
    'journal-entry',
    'ammo',
    'force-field',
    'weapon-mod',
    'critical-injury',
    'storage-location',
    'ship-weapon',
    'ship-component',
    'ship-upgrade',
    'npc-template',
];
for (const t of itemTypes) live.add(`wh40k-${t}-sheet`);
const vitalKeys = ['wounds', 'fatigue', 'fate', 'experience', 'mobility', 'corruption', 'insanity'];
for (const k of vitalKeys) live.add(`wh40k-${k}-badge`);

// --- selector liveness ---
const SELECTOR_CLASS_RE = /\.(wh40k-[a-zA-Z0-9_-]+)/g;

/**
 * @param {string} selector — a single selector (no commas)
 * @returns {boolean}
 */
function isSelectorLive(selector) {
    // Nested syntax: parent &  — postcss-nested. The local selector here is
    // relative to its parent. If we got here, the parent rule was kept (we
    // walk top-down and delete parents first), so & is fine.
    const classes = [...selector.matchAll(SELECTOR_CLASS_RE)].map((m) => m[1]);
    if (classes.length === 0) return true; // targets non-class (chrome, element, id, etc.)
    return classes.every((c) => live.has(c));
}

const removed = [];

function processNode(node) {
    if (node.type === 'rule') {
        // Don't touch @keyframes children — `from`/`to`/percentages aren't class selectors
        if (node.parent && node.parent.type === 'atrule' && /keyframes/i.test(node.parent.name)) return;
        const parts = node.selector.split(/\s*,\s*/);
        const live = parts.filter(isSelectorLive);
        if (live.length === 0) {
            removed.push({ selector: node.selector, source: locateSource(node) });
            node.remove();
            return;
        }
        if (live.length !== parts.length) {
            const dropped = parts.filter((s) => !isSelectorLive(s));
            removed.push({ partial: dropped, kept: live, source: locateSource(node) });
            node.selector = live.join(',\n');
        }
        // Recurse into nested rules (postcss-nested syntax)
        node.each((child) => processNode(child));
    } else if (node.type === 'atrule') {
        // Recurse into @media/@supports/@layer; skip @keyframes/@font-face/@import
        if (/^(media|supports|layer|container)$/i.test(node.name)) {
            node.each((child) => processNode(child));
            // If the atrule body became empty, remove it
            if (node.nodes && node.nodes.length === 0) {
                removed.push({ atrule: `@${node.name} ${node.params}` });
                node.remove();
            }
        }
    }
}

// Track which source-marker block each removed rule was in
const sourceMarkers = []; // { line, source }
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

const original = readFileSync(MONOLITH, 'utf8');
buildSourceMarkers(original);

const root = postcss.parse(original);
root.each((node) => processNode(node));

const out = root.toResult().css;

const summary = {
    originalLines: original.split('\n').length,
    newLines: out.split('\n').length,
    rulesRemoved: removed.length,
    bySource: {},
};
for (const r of removed) {
    const s = r.source ?? '__inline__';
    summary.bySource[s] = (summary.bySource[s] ?? 0) + 1;
}
console.log(`Original: ${summary.originalLines} lines`);
console.log(`Pruned:   ${summary.newLines} lines  (Δ -${summary.originalLines - summary.newLines})`);
console.log(`Rules removed: ${summary.rulesRemoved}`);
console.log('By source:');
for (const [src, n] of Object.entries(summary.bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${n}`);
}

if (!dryRun) {
    writeFileSync(MONOLITH, out, 'utf8');
    writeFileSync(resolve(ROOT, '.css-prune-manifest.json'), JSON.stringify({ summary, removed }, null, 2));
    console.log(`\nWrote ${MONOLITH}`);
    console.log(`Wrote .css-prune-manifest.json`);
} else {
    console.log('\n(dry run — no files written)');
}
