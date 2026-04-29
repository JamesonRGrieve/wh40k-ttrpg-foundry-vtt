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
// basic-action-manager.ts queries all roll-control__* selectors by class name
const ROLL_CONTROL_RE = /^roll-control__/;
const JS_HOOKS = new Set([
    'sheet-control__hide-control',
    // expandable-tooltip-mixin.ts queries and toggles these classes by name
    'wh40k-expandable',
    'wh40k-expandable--expanded',
    'wh40k-expansion-panel',
    'wh40k-expansion-panel--open',
    // item-preview-card.ts renders stat-pill elements by class name
    'wh40k-stat-pill',
    'wh40k-stat-pill__icon',
    'wh40k-stat-pill__value',
    'wh40k-stat-pill__label',
    // item-preview-card.ts renders badge elements by class name
    'wh40k-badge',
    // primary-sheet-mixin.ts / talent-editor-dialog.ts / character-sheet.ts toggle
    // this class on tab buttons and tab content panels via classList.toggle('active', …)
    'active',
    // tests/item-header-partial.test.ts queries these by class name — test selectors
    'wh40k-item-header__image',
    'wh40k-item-header__name',
    'wh40k-badge--type',
    'wh40k-badge--tier',
    'wh40k-badge--category',
    // tests/storybook-templates.test.ts queries this by class name — test selector
    'wh40k-roll-card__value--negative',
    // tests query modifier count badge by class name — test selector
    'wh40k-modifier-count',
    // Google Material Icons library — third-party icon font, not project CSS
    'material-icons',
    'material-icons-outlined',
    'material-icons-round',
    'material-icons-sharp',
    'material-icons-two-tone',
]);
const SECTION_ID_RE = /^[a-z][a-z0-9_]*_(details|section|panel|body|header)$/;

/** Return true when a bare utility string is a Tailwind utility (any polarity). */
function isTwBare(s) {
    return s.startsWith('tw-') || s.startsWith('-tw-') || s.startsWith('!tw-');
}

/**
 * Find the last colon that is at bracket-depth 0 in `token`.
 * This is the variant-separator colon for all Tailwind variant forms:
 *   - `hover:tw-bg-gold`           (plain word variant)
 *   - `[&>label]:tw-block`         (arbitrary selector variant)
 *   - `data-[active=true]:tw-ring` (data-attribute variant)
 * Returns the index, or -1 if none found at depth 0.
 */
function lastTopLevelColon(token) {
    let depth = 0;
    let lastColon = -1;
    for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === ':' && depth === 0) lastColon = i;
    }
    return lastColon;
}

function isTwOrExempt(token) {
    // Fast path: raw token is already a Tailwind utility (also handles
    // `tw-text-[color:var(--foo)]` where the colon is inside brackets).
    if (isTwBare(token)) return true;

    // Strip one Tailwind variant prefix by finding the last colon at bracket-depth 0.
    // This handles all variant forms: `hover:`, `[&>label]:`, `data-[active=true]:`, etc.
    const sep = lastTopLevelColon(token);
    if (sep !== -1) {
        const bare = token.slice(sep + 1);
        if (isTwBare(bare)) return true;
    }

    if (FA_RE.test(token)) return true;
    if (JS_HOOKS.has(token)) return true;
    if (ROLL_CONTROL_RE.test(token)) return true;
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
