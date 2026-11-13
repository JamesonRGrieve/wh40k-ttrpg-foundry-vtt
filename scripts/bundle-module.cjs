/**
 * Bundle the system's client code into one minified ES module (#705).
 *
 * Foundry loads `module/wh40k-rpg.js` (system.json `esmodules`). Before #705
 * that was tsc's unbundled output: 772 modules fetched one import level at a
 * time, unminified. esbuild now writes the whole graph to that one file.
 *
 * - No code splitting. The source's `import()` calls are inlined as lazy
 *   initialisers, so boot fetches exactly one script, and esbuild's known
 *   cross-chunk ordering issue never applies (the graph has import cycles).
 * - `keepNames`: Foundry builds sheet ids from class names
 *   (`wh40k-rpg.CharacterSheet`) and worlds store those ids, so minifying must
 *   not rename classes or functions.
 * - The entry also exports `modules`, keyed by source path without extension
 *   (`applications/hud/world-time-widget`). A module the entry loads statically
 *   maps to its namespace, and any other module to a loader, so its top-level
 *   code still runs only when something asks for it. Tier B specs reach the
 *   live instances through it; the e2e fixture serves the old per-file URLs as
 *   shims over this map (tests/e2e/lib/module-shim.ts).
 * - A linked source map sits next to the bundle. Browsers fetch it only with
 *   devtools open, and Tier B source coverage maps through it. The release zip
 *   leaves it out.
 *
 * Usage: node scripts/bundle-module.cjs [outdir]   (default dist/module)
 */
const { readdirSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const esbuild = require('esbuild');

const ROOT = resolve(__dirname, '..');
const SOURCE_DIR = join(ROOT, 'src', 'module');
const ENTRY = join(SOURCE_DIR, 'wh40k-rpg.ts');
const VIRTUAL_ENTRY = 'wh40k-rpg-bundle-entry';

/** Shared esbuild options for both passes. */
const BASE_OPTIONS = {
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'error',
    // Foundry is loaded from the page, never bundled.
    external: [],
};

/** Every runtime source module: `.ts` under src/module, minus tests, stories, declarations and test helpers. */
function runtimeModules(dir = SOURCE_DIR) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'testing' ? [] : runtimeModules(path);
        return /\.ts$/.test(entry.name) && !/\.(?:test|stories|d)\.ts$/.test(entry.name) ? [path] : [];
    });
}

/** The modules the entry loads through static imports (its boot graph), as absolute paths. */
async function staticGraph() {
    const result = await esbuild.build({ ...BASE_OPTIONS, entryPoints: [ENTRY], write: false, metafile: true, outdir: 'unused' });
    const inputs = result.metafile.inputs;
    const start = relative(ROOT, ENTRY);
    const seen = new Set();
    const queue = [start];
    while (queue.length > 0) {
        const next = queue.pop();
        if (seen.has(next) || inputs[next] === undefined) continue;
        seen.add(next);
        for (const imported of inputs[next].imports) {
            if (imported.kind === 'import-statement') queue.push(imported.path);
        }
    }
    return new Set([...seen].map((p) => resolve(ROOT, p)));
}

/** Source of the bundle entry: the system entry, then the `modules` map. */
function entrySource(modules, eager) {
    const key = (file) => relative(SOURCE_DIR, file).replace(/\.ts$/, '').split('\\').join('/');
    const spec = (file) => `./${relative(SOURCE_DIR, file).split('\\').join('/')}`;
    const lines = [`export * from ${JSON.stringify(spec(ENTRY))};`];
    const entries = [];
    modules.forEach((file, index) => {
        if (eager.has(file)) {
            lines.push(`import * as m${index} from ${JSON.stringify(spec(file))};`);
            entries.push(`${JSON.stringify(key(file))}: m${index}`);
        } else {
            entries.push(`${JSON.stringify(key(file))}: () => import(${JSON.stringify(spec(file))})`);
        }
    });
    lines.push(`export const modules = Object.freeze({ ${entries.join(', ')} });`);
    return lines.join('\n');
}

/**
 * Write `<outdir>/wh40k-rpg.js` (+ `.map`). Resolves with the esbuild metafile.
 * @param {{ outdir?: string, minify?: boolean }} [options]
 */
async function bundleModule({ outdir = join(ROOT, 'dist', 'module'), minify = true } = {}) {
    const modules = runtimeModules().filter((file) => file !== ENTRY);
    const eager = await staticGraph();
    const contents = entrySource(modules, eager);
    const result = await esbuild.build({
        ...BASE_OPTIONS,
        entryPoints: { 'wh40k-rpg': VIRTUAL_ENTRY },
        plugins: [
            {
                name: 'wh40k-bundle-entry',
                setup(build) {
                    build.onResolve({ filter: new RegExp(`^${VIRTUAL_ENTRY}$`) }, () => ({ path: VIRTUAL_ENTRY, namespace: 'wh40k-entry' }));
                    build.onLoad({ filter: /.*/, namespace: 'wh40k-entry' }, () => ({ contents, loader: 'ts', resolveDir: SOURCE_DIR }));
                },
            },
        ],
        outdir,
        minify,
        keepNames: true,
        sourcemap: 'linked',
        sourcesContent: false,
        legalComments: 'none',
        metafile: true,
    });
    return result.metafile;
}

module.exports = { bundleModule, runtimeModules };

if (require.main === module) {
    bundleModule({ outdir: process.argv[2] ? resolve(process.argv[2]) : undefined }).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
