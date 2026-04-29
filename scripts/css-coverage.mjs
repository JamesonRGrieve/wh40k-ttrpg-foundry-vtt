#!/usr/bin/env node
/**
 * Classify every Handlebars template under src/templates/ as one of:
 *
 *   tailwind-only — every `class="…"` (and `class={{…}}` literal) on the
 *                   template uses only `tw-*` classes (Tailwind utilities,
 *                   the configured `prefix: "tw-"`) or has no class
 *                   attributes at all.
 *   mixed         — has at least one `tw-*` class AND at least one non-`tw-`
 *                   class.
 *   css-only      — has class attributes but uses zero `tw-*` classes.
 *
 * The classifier is deliberately syntactic, not semantic: it counts class
 * tokens. The goal is a coverage metric the ratchet can drive monotonically
 * downward — it is fine if a "tailwind-only" template still uses CSS
 * variables in inline `style` attributes; that counts as Tailwind by the
 * "tokens not classes" rule.
 *
 * Outputs:
 *   .css-coverage.json  — machine-readable, used by the ratchet.
 *   stdout              — per-directory markdown table.
 *
 * Usage:
 *   node scripts/css-coverage.mjs            # write report + print table
 *   node scripts/css-coverage.mjs --json     # JSON only on stdout
 *   node scripts/css-coverage.mjs --quiet    # write report, no stdout
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/templates');
const OUT = resolve(process.cwd(), '.css-coverage.json');
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const quiet = args.has('--quiet');

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (st.isFile() && name.endsWith('.hbs')) yield full;
    }
}

const CLASS_ATTR_RE = /class(?:Name)?\s*=\s*"([^"]*)"|class(?:Name)?\s*=\s*'([^']*)'/g;

/**
 * Tokens that are NOT the project's custom CSS classes and therefore should
 * not count against the "tailwind-only" classification:
 *
 * 1. `tw-*` tokens              — Tailwind utilities (bare or variant-prefixed,
 *                                  e.g. `hover:tw-bg-gold`, `focus:tw-outline-none`).
 *                                  Variant prefix ("<modifier>:") is stripped before
 *                                  the `tw-` check so that `hover:tw-*` counts as Tailwind.
 *
 * 2. Font Awesome tokens         — `fas`, `far`, `fab`, `fal`, `fat`, `fa-solid`,
 *                                  `fa-regular`, `fa-brands`, `fa-light`, `fa-thin`,
 *                                  `fa-duotone`, and any `fa-<name>` icon tokens.
 *                                  These are a third-party icon library; migrating to
 *                                  Tailwind has no bearing on them.
 *
 * 3. JS-hook infrastructure       — `sheet-control__hide-control` and similar tokens
 *                                  that are permanent JS selectors (not project CSS).
 *
 * 4. Expand/collapse section IDs  — bare identifiers that match the `data-toggle`
 *                                  pattern (`<word>_details`, `<word>_section`).
 *                                  These are HBS `hideIfNot` targets, not CSS classes.
 *
 * Anything else is treated as a project CSS class (hasNonTw = true).
 */
const FA_RE = /^fa[rsbldt]$|^fa-(solid|regular|brands|light|thin|duotone)$|^fa-/;
const JS_HOOKS = new Set(['sheet-control__hide-control']);
const SECTION_ID_RE = /^[a-z][a-z0-9_]*_(details|section|panel|body|header)$/;

function isTwOrExempt(token) {
    // Check raw token first (handles `tw-text-[color:var(--foo)]` where the colon
    // is inside brackets, not a variant separator).
    if (token.startsWith('tw-')) return true;
    // Strip optional Tailwind variant prefix (e.g. `hover:`, `focus:`, `active:`, `dh2e:`)
    // Only strip a prefix colon that appears before any `[` bracket — colons inside
    // arbitrary-value brackets (e.g. `tw-text-[color:var(--x)]`) are not variant separators.
    const bracketPos = token.indexOf('[');
    const colonPos = token.indexOf(':');
    const hasVariantColon = colonPos !== -1 && (bracketPos === -1 || colonPos < bracketPos);
    const bare = hasVariantColon ? token.slice(colonPos + 1) : token;
    if (bare.startsWith('tw-')) return true;
    if (FA_RE.test(token)) return true;
    if (JS_HOOKS.has(token)) return true;
    if (SECTION_ID_RE.test(token)) return true;
    return false;
}

function classifyFile(file) {
    const src = readFileSync(file, 'utf8');
    let hasTw = false;
    let hasNonTw = false;
    let hasAnyClass = false;

    let m;
    while ((m = CLASS_ATTR_RE.exec(src)) !== null) {
        const value = m[1] ?? m[2] ?? '';
        // Strip Handlebars expressions inside class attribute; they are dynamic
        // and we do not classify them.
        const cleaned = value.replace(/\{\{[^}]*\}\}/g, ' ');
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) continue;
        hasAnyClass = true;
        for (const t of tokens) {
            if (isTwOrExempt(t)) hasTw = true;
            else hasNonTw = true;
        }
    }

    if (!hasAnyClass) return 'tailwind-only';
    if (hasTw && !hasNonTw) return 'tailwind-only';
    if (hasTw && hasNonTw) return 'mixed';
    return 'css-only';
}

const byFile = {};
const byDir = {};
const totals = { 'tailwind-only': 0, mixed: 0, 'css-only': 0 };
let total = 0;

for (const file of walk(ROOT)) {
    const cls = classifyFile(file);
    const rel = relative(process.cwd(), file);
    byFile[rel] = cls;
    totals[cls]++;
    total++;

    const dirRel = relative(ROOT, file).split(sep).slice(0, -1).join('/') || '.';
    byDir[dirRel] ??= { 'tailwind-only': 0, mixed: 0, 'css-only': 0, total: 0 };
    byDir[dirRel][cls]++;
    byDir[dirRel].total++;
}

const summary = { total, ...totals };
const payload = { generatedAt: new Date().toISOString(), summary, byDir, byFile };
const serialized = JSON.stringify(payload, null, 2) + '\n';

if (!jsonOnly) writeFileSync(OUT, serialized, 'utf8');

if (jsonOnly) {
    process.stdout.write(serialized);
    process.exit(0);
}

if (quiet) {
    process.exit(0);
}

const dirs = Object.keys(byDir).sort();
const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

console.log(`\n[css-coverage] ${total} templates total under src/templates/`);
console.log(`  tailwind-only: ${totals['tailwind-only']} (${pct(totals['tailwind-only'], total)})`);
console.log(`  mixed:         ${totals.mixed} (${pct(totals.mixed, total)})`);
console.log(`  css-only:      ${totals['css-only']} (${pct(totals['css-only'], total)})`);
console.log('');
console.log('| directory | tailwind-only | mixed | css-only | total |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const d of dirs) {
    const r = byDir[d];
    console.log(`| ${d} | ${r['tailwind-only']} | ${r.mixed} | ${r['css-only']} | ${r.total} |`);
}
console.log('');
console.log(`Report written to ${OUT}.`);
