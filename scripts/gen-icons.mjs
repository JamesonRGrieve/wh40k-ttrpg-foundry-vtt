#!/usr/bin/env node
/**
 * Icon registry generator.
 *
 * Scans `src/templates/**\/*.hbs` and `src/module/**\/*.ts` for icon references
 * and emits two artifacts:
 *
 *   - src/module/icons/registry.generated.ts — runtime registry mapping
 *     `family:name` → inline SVG string. Only icons actually referenced
 *     anywhere in the source tree are bundled.
 *   - src/module/types/icon-keys.d.ts — string-literal union of every key
 *     present in the registry, so `icon(key)` calls fail at typecheck on
 *     misspelling or removal.
 *
 * Reference syntax (case-sensitive):
 *
 *   {{iconSvg "fa:dice-d20" class="..."}}           ← Handlebars helper
 *   icon('fa:dice-d20')                             ← TS call site
 *
 * The helper is named `iconSvg` rather than the more obvious `icon` to avoid
 * collision with the existing partial convention of passing an `icon` hash
 * variable into shells like `panel.hbs` / `vital-panel-shell.hbs` /
 * `collapsible-panel.hbs` — Handlebars resolves a registered helper before a
 * context variable of the same name.
 *
 * Adding a new family = add one entry to FAMILIES below. The scanner is
 * family-agnostic; it only requires that the family resolver export
 * `(name) => string | null`.
 *
 * Run automatically pre-commit (registered in .husky/pre-commit). Idempotent —
 * re-running on unchanged input produces unchanged output.
 *
 * Usage:
 *   node scripts/gen-icons.mjs            # regenerate
 *   node scripts/gen-icons.mjs --check    # exit non-zero if stale
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

// CommonJS shim for require() inside an .mjs file.
const require = createRequire(import.meta.url);

const TEMPLATES_ROOT = resolve(process.cwd(), 'src/templates');
const MODULE_ROOT = resolve(process.cwd(), 'src/module');
const REGISTRY_OUT = resolve(process.cwd(), 'src/module/icons/registry.generated.ts');
const TYPES_OUT = resolve(process.cwd(), 'src/module/types/icon-keys.d.ts');
const checkMode = process.argv.includes('--check');

// Family resolvers. Each takes a kebab-case name and returns an inline SVG
// string (with currentColor) or null if the icon isn't in that family.
const FAMILIES = {
    fa: resolveFontAwesome,
    far: resolveFontAwesomeRegular,
    lucide: resolveLucide,
};

// kebab-case → CamelCase, e.g. "dice-d20" → "DiceD20".
function kebabToPascal(name) {
    return name
        .split('-')
        .filter(Boolean)
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join('');
}

function resolveFontAwesome(name) {
    return resolveFa(name, '@fortawesome/free-solid-svg-icons', 'fa');
}

function resolveFontAwesomeRegular(name) {
    return resolveFa(name, '@fortawesome/free-regular-svg-icons', 'fa');
}

function resolveFa(name, modulePath, exportPrefix) {
    let mod;
    try {
        mod = require(modulePath);
    } catch {
        return null;
    }
    const exportName = exportPrefix + kebabToPascal(name);
    const def = mod[exportName];
    if (!def || !Array.isArray(def.icon)) return null;
    const [width, height, , , path] = def.icon;
    // FontAwesome path may be string or array (multi-path duotone). Solid/regular
    // ship single-path strings; we only support that shape.
    if (typeof path !== 'string') return null;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
        `fill="currentColor" aria-hidden="true" focusable="false">` +
        `<path d="${path}"/></svg>`
    );
}

function resolveLucide(name) {
    let mod;
    try {
        mod = require('lucide');
    } catch {
        return null;
    }
    const exportName = kebabToPascal(name);
    const def = mod[exportName];
    if (!Array.isArray(def)) return null;
    // Lucide ships [tag, attrs, children?] tuples. Render to SVG inner markup.
    const inner = def
        .map((node) => {
            if (!Array.isArray(node) || node.length < 2) return '';
            const [tag, attrs] = node;
            const attrStr = Object.entries(attrs)
                .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
                .join(' ');
            return `<${tag}${attrStr ? ' ' + attrStr : ''}/>`;
        })
        .join('');
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
        `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
        `aria-hidden="true" focusable="false">${inner}</svg>`
    );
}

// Walk a directory yielding files matching one of the suffixes.
function* walk(dir, suffixes) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full, suffixes);
        else if (st.isFile() && suffixes.some((s) => name.endsWith(s))) yield full;
    }
}

// Scan source for icon references. Returns Set<"family:name">.
function scanReferences() {
    const out = new Set();
    // {{iconSvg "family:name" ...}} or {{iconSvg 'family:name' ...}}
    const helperRe = /\{\{\s*iconSvg\s+(['"])([a-z]+):([a-z0-9-]+)\1/g;
    // icon('family:name')  or  icon("family:name")  in TS
    const tsRe = /\bicon\(\s*(['"])([a-z]+):([a-z0-9-]+)\1/g;

    for (const f of walk(TEMPLATES_ROOT, ['.hbs'])) {
        const src = readFileSync(f, 'utf8');
        let m;
        while ((m = helperRe.exec(src)) !== null) out.add(`${m[2]}:${m[3]}`);
        helperRe.lastIndex = 0;
    }

    for (const f of walk(MODULE_ROOT, ['.ts'])) {
        // Skip the registry itself — it would otherwise self-reference every key.
        if (f.endsWith('registry.generated.ts')) continue;
        // Skip co-located tests; their negative-path assertions deliberately
        // reference unbundled keys (e.g. 'fa:does-not-exist') and the scanner
        // shouldn't try to resolve them.
        if (f.endsWith('.test.ts')) continue;
        const src = readFileSync(f, 'utf8');
        let m;
        while ((m = tsRe.exec(src)) !== null) out.add(`${m[2]}:${m[3]}`);
        tsRe.lastIndex = 0;
    }

    // Always include the demo references that the storybook + tests rely on,
    // so a fresh checkout boots with at least one icon per family. These are
    // duplicated in stories/icon.stories.ts and src/module/icons/icon.test.ts
    // — keep in sync.
    out.add('fa:dice-d20');
    out.add('fa:cog');
    out.add('lucide:dice-5');
    out.add('lucide:settings');
    return out;
}

function generate() {
    const refs = [...scanReferences()].sort();
    const entries = [];
    const missing = [];
    for (const ref of refs) {
        const [family, name] = ref.split(':');
        const resolver = FAMILIES[family];
        if (!resolver) {
            missing.push(`${ref} (unknown family "${family}")`);
            continue;
        }
        const svg = resolver(name);
        if (!svg) {
            missing.push(`${ref} (resolver returned null — name not in family)`);
            continue;
        }
        entries.push([ref, svg]);
    }

    if (missing.length) {
        console.error('[gen-icons] unresolved icon references:');
        for (const m of missing) console.error('  - ' + m);
        process.exit(2);
    }

    const banner =
        `// AUTO-GENERATED by scripts/gen-icons.mjs from src/templates/**\/*.hbs and src/module/**\/*.ts.\n` +
        `// Do not edit by hand. Run \`pnpm icons:gen\` (or commit; the pre-commit hook regenerates) to refresh.\n` +
        `\n`;
    const registryBody =
        `export const ICON_REGISTRY: Record<string, string> = {\n` +
        entries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') +
        `\n};\n`;
    const registryOut = banner + registryBody;

    const typesBody =
        entries.length === 0
            ? `export type IconKey = never;\n`
            : `export type IconKey =\n` +
              entries.map(([k]) => `    | ${JSON.stringify(k)}`).join('\n') +
              `;\n`;
    const typesOut = banner + typesBody;

    return { registryOut, typesOut };
}

function ensureDir(filePath) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const { registryOut, typesOut } = generate();

if (checkMode) {
    const oldRegistry = existsSync(REGISTRY_OUT) ? readFileSync(REGISTRY_OUT, 'utf8') : '';
    const oldTypes = existsSync(TYPES_OUT) ? readFileSync(TYPES_OUT, 'utf8') : '';
    if (oldRegistry !== registryOut || oldTypes !== typesOut) {
        console.error('[gen-icons] generated artifacts are stale. Run `pnpm icons:gen` and commit.');
        process.exit(1);
    }
    process.exit(0);
}

ensureDir(REGISTRY_OUT);
ensureDir(TYPES_OUT);
writeFileSync(REGISTRY_OUT, registryOut);
writeFileSync(TYPES_OUT, typesOut);
console.log(`[gen-icons] wrote ${REGISTRY_OUT}`);
console.log(`[gen-icons] wrote ${TYPES_OUT}`);
