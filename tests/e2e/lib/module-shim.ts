import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { buildSync } from 'esbuild';

/**
 * Per-file module URLs for Tier B specs (#705).
 *
 * The system ships one bundle, `module/wh40k-rpg.js`, so the per-file URLs
 * specs import inside `page.evaluate` (`/systems/wh40k-rpg/module/applications/
 * hud/world-time-widget.js`) no longer exist on the server. This route answers
 * each one with a small module that re-exports that source module's live
 * instance from the bundle's `modules` map, so a spec sees the same classes,
 * registries and state the system booted with.
 *
 * Export names come from the TypeScript source, resolved by esbuild (so
 * `export *` re-exports are listed too). They are cached per worker.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SOURCE_DIR = resolve(REPO_ROOT, 'src', 'module');
const MODULE_PREFIX = '/systems/wh40k-rpg/module/';
const BUNDLE_URL = `${MODULE_PREFIX}wh40k-rpg.js`;

const exportCache = new Map<string, readonly string[]>();

/** The export names of one source module, `default` included. */
function exportNames(sourceFile: string): readonly string[] {
    const cached = exportCache.get(sourceFile);
    if (cached !== undefined) return cached;
    const result = buildSync({
        entryPoints: [sourceFile],
        bundle: true,
        packages: 'external',
        format: 'esm',
        platform: 'browser',
        write: false,
        metafile: true,
        outdir: 'unused',
        logLevel: 'silent',
    });
    const output = Object.values(result.metafile.outputs).find((o) => o.entryPoint !== undefined);
    const names = output?.exports ?? [];
    exportCache.set(sourceFile, names);
    return names;
}

/** The re-exporting module served for one source module, keyed by its path without extension. */
function shimSource(key: string, names: readonly string[]): string {
    const named = names.filter((n) => n !== 'default');
    return [
        `import { modules } from ${JSON.stringify(BUNDLE_URL)};`,
        `const entry = modules[${JSON.stringify(key)}];`,
        `if (entry === undefined) throw new Error(${JSON.stringify(`wh40k-rpg bundle has no module ${key}`)});`,
        `const m = typeof entry === 'function' ? await entry() : entry;`,
        ...(names.includes('default') ? ['export default m.default;'] : []),
        ...(named.length > 0 ? [`export const { ${named.join(', ')} } = m;`] : []),
    ].join('\n');
}

async function handle(route: Route): Promise<void> {
    const { pathname } = new URL(route.request().url());
    const rel = pathname.slice(MODULE_PREFIX.length);
    const key = rel.replace(/\.js$/, '');
    const sourceFile = resolve(SOURCE_DIR, `${key}.ts`);
    if (pathname === BUNDLE_URL || !rel.endsWith('.js') || !sourceFile.startsWith(SOURCE_DIR) || !existsSync(sourceFile)) {
        await route.continue();
        return;
    }
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: shimSource(key, exportNames(sourceFile)) });
}

/** Serve per-file module URLs on this page from the bundle. */
export async function installModuleShims(page: Page): Promise<void> {
    await page.route(`**${MODULE_PREFIX}**/*.js`, handle);
}
