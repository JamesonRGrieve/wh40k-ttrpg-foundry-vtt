/**
 * Build gate: the system's runtime JavaScript must not import npm packages.
 *
 * The system ships unbundled — tsc output loaded by the browser as native ES
 * modules. A bare specifier (`import { z } from 'zod'`) cannot resolve there, and
 * one unresolvable import fails the WHOLE module graph: the system never
 * initialises, every document falls back to Foundry's default sheet, and nothing
 * useful reaches the console. That shipped once (#588's scene-lighting imported
 * zod). This scans the COMPILED runtime modules — after tsc has erased type-only
 * imports, so only what the browser will actually request is checked — and fails
 * the build on any import whose specifier is not a relative/absolute path.
 *
 * Test code (`*.test.js`, `*.stories.js`, `testing/`) is compiled into dist but
 * never loaded by Foundry, so it is exempt.
 *
 * Usage: node scripts/check-runtime-imports.cjs [dist/module]
 */
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, join, relative, resolve, sep } = require('node:path');

/** Static `import … from 'x'`, `export … from 'x'`, side-effect `import 'x'`, and dynamic `import('x')`. */
const SPECIFIER_PATTERNS = [
    /^\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** A specifier the browser resolves without an import map: relative, absolute or a URL. */
function isResolvable(specifier) {
    return /^(?:\.{1,2}\/|\/|https?:\/\/|data:)/.test(specifier);
}

/** Is this compiled file test-only (never loaded by Foundry)? */
function isTestOnly(relPath) {
    return /\.(?:test|stories)\.js$/.test(relPath) || relPath.split(sep).includes('testing');
}

/** Every bare import specifier in one compiled module's source. */
function bareImports(source) {
    const found = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
            if (!isResolvable(match[1])) found.add(match[1]);
        }
    }
    return [...found];
}

function* walkJs(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) yield* walkJs(full);
        else if (entry.name.endsWith('.js')) yield full;
    }
}

/** Every relative import specifier (`./x.js`, `../y.js`) in one compiled module's source. */
function relativeImports(source) {
    const found = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
            if (/^\.{1,2}\//.test(match[1])) found.add(match[1]);
        }
    }
    return [...found];
}

/**
 * Every `{ file, specifier }` runtime import the browser could not load: a bare
 * package specifier, or a relative path to a file that is not in the build (the
 * failure that shipped a nightly without its entry module).
 */
function findBareRuntimeImports(moduleRoot) {
    const problems = [];
    for (const file of walkJs(moduleRoot)) {
        const rel = relative(moduleRoot, file);
        if (isTestOnly(rel)) continue;
        const source = readFileSync(file, 'utf8');
        for (const specifier of bareImports(source)) problems.push({ file: rel, specifier });
        for (const specifier of relativeImports(source)) {
            if (!existsSync(resolve(dirname(file), specifier))) problems.push({ file: rel, specifier: `${specifier} (missing from the build)` });
        }
    }
    return problems;
}

module.exports = { bareImports, findBareRuntimeImports, isTestOnly, relativeImports };

if (require.main === module) {
    const root = process.argv[2] ?? 'dist/module';
    const problems = findBareRuntimeImports(root);
    if (problems.length > 0) {
        console.error(`[runtime-imports] ${problems.length} unloadable import(s) in shipped runtime modules — the browser cannot resolve these, so the system would not load:`);
        for (const { file, specifier } of problems) console.error(`  ${file}: '${specifier}'`);
        process.exit(1);
    }
    console.log(`[runtime-imports] OK: every runtime import in ${root} resolves`);
}
