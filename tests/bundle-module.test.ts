/**
 * Guard (#705): the client ships as one minified ES module built by esbuild
 * (scripts/bundle-module.cjs), not tsc's 772 unbundled modules.
 *
 * Builds the bundle into a temp directory and checks what boot depends on: one
 * script and its source map, no imports left for the browser to fetch, class
 * names kept for Foundry's sheet ids, and the `modules` map Tier B specs read
 * (static modules as namespaces, lazily loaded ones as loaders). It also pins the
 * build wiring and the release zip leaving source maps out.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const requireCjs = createRequire(import.meta.url);

interface BundleScript {
    bundleModule: (options: { outdir: string }) => Promise<{ outputs: Record<string, { bytes: number }> }>;
}

const { bundleModule } = requireCjs(resolve(ROOT, 'scripts/bundle-module.cjs')) as BundleScript;

let outdir = '';
let bundle = '';

beforeAll(async () => {
    outdir = mkdtempSync(join(tmpdir(), 'wh40k-bundle-'));
    await bundleModule({ outdir });
    bundle = readFileSync(join(outdir, 'wh40k-rpg.js'), 'utf8');
}, 60_000);

afterAll(() => {
    rmSync(outdir, { recursive: true, force: true });
});

describe('the client bundle (#705)', () => {
    it('is one script and its linked source map', () => {
        expect(readdirSync(outdir).sort()).toEqual(['wh40k-rpg.js', 'wh40k-rpg.js.map']);
        expect(bundle.trimEnd().endsWith('//# sourceMappingURL=wh40k-rpg.js.map')).toBe(true);
    });

    it('leaves no import for the browser to fetch, and is minified', () => {
        expect(bundle).not.toMatch(/(?:^|[;}\n])\s*import\s*(?:[\w{*][^;]*from\s*)?["']/);
        expect(bundle).not.toMatch(/\bimport\(\s*["']/);
        // Minified: parameter names are shortened. (Line length is no measure: the
        // bundled template sources become multi-line template literals, #708.)
        expect(bundle).not.toContain('function lazyTemplate(source, handlebars)');
        expect(bundle).not.toContain('(source, handlebars)');
    });

    it('keeps class names, which Foundry turns into the sheet ids worlds store', () => {
        expect(bundle).toContain('"DarkHeresy2PlayerSheet"');
        expect(bundle).toContain('"WorldTimeWidget"');
    });

    it('exports every module: static ones as namespaces, lazily loaded ones as loaders', () => {
        expect(bundle).toMatch(/export\s*\{[^}]*\bas modules\b/);
        // Loaded at boot through static imports.
        expect(bundle).toMatch(/"wh40k-rpg-settings":[\w$]+[,}]/);
        // Reached only through `import()` in hooks-manager, so it stays lazy.
        expect(bundle).toMatch(/"applications\/prompts\/batch-xp-dialog":[\w$]*\(?\(\)=>/);
    });
});

describe('templates ride in the bundle (#708)', () => {
    it('carries every template under src/templates, keyed by the path Foundry uses', () => {
        const { templateFiles } = requireCjs(resolve(ROOT, 'scripts/bundle-module.cjs')) as { templateFiles: () => string[] };
        const files = templateFiles();
        expect(files.length).toBeGreaterThan(400);
        const missing = files
            .map((file) => `systems/wh40k-rpg/templates/${file.slice(resolve(ROOT, 'src/templates').length + 1)}`)
            .filter((key) => !bundle.includes(JSON.stringify(key)));
        expect(missing).toEqual([]);
    });

    it('registers them as partials before init', () => {
        // The sources are set on the global ahead of the system entry, which registers them.
        expect(bundle.indexOf('globalThis.wh40kTemplateSources=')).toBeGreaterThan(-1);
        expect(bundle.indexOf('globalThis.wh40kTemplateSources=')).toBeLessThan(bundle.indexOf('"registerBundledTemplates"'));
    });
});

describe('build and release wiring (#705)', () => {
    const gulpfile = readFileSync(resolve(ROOT, 'gulpfile.js'), 'utf8');

    it('type-checks with tsc without emitting, then bundles and checks the bundle', () => {
        expect(gulpfile).toContain("'pnpm exec tsc --pretty false --noEmit -p tsconfig.build.json'");
        expect(gulpfile).toContain('const compileModule = gulp.series(compileTypeScript, bundleClientModule, checkRuntimeImports);');
    });

    it('keeps source maps out of both release archives', () => {
        expect(gulpfile).toMatch(/`!\$\{BUILD_DIR\}\/\*\*\/\*\.map`/);
        expect(readFileSync(resolve(ROOT, '.github/workflows/release.yml'), 'utf8')).toContain("zip -r -9 ../wh40k-rpg.zip . -x '*.map'");
    });
});
