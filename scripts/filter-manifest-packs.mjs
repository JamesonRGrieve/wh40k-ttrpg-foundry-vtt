#!/usr/bin/env node
/**
 * Filter a built manifest's `packs[]` down to the packs that actually shipped in
 * this build's `dist/packs`.
 *
 * `src/system.json` declares only the public generic packs in src/packs; the
 * copyrighted content's declarations live in the private repo and are merged only
 * by the campaign deploy (scripts/merge-private-manifest.mjs). The public vectors
 * (the nightly manifest and the manual `build-system.sh release`) still rewrite
 * `packs[]` to exactly the pack dirs present on disk, as a safety net: a declared
 * public pack that failed to build is dropped instead of making Foundry error on
 * a missing pack directory.
 *
 * The campaign deploy does NOT use this — it ships every declared pack.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * @param {Array<{path?: string}>} packs the manifest's declared packs
 * @param {string} distDir the built system root (the dir holding `packs/`)
 * @returns {Array} only the entries whose `path` dir exists under distDir
 */
export function presentPacks(packs, distDir) {
    return (packs ?? []).filter((p) => typeof p?.path === 'string' && existsSync(resolve(distDir, p.path)));
}

/** Rewrite a manifest file's `packs[]` in place to those present beside it. */
function filterManifestPacks(manifestFile) {
    const file = resolve(manifestFile);
    const sys = JSON.parse(readFileSync(file, 'utf8'));
    const before = (sys.packs ?? []).length;
    sys.packs = presentPacks(sys.packs, dirname(file));
    writeFileSync(file, `${JSON.stringify(sys, null, 4)}\n`);
    return { before, after: sys.packs.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const target = process.argv[2] ?? 'dist/system.json';
    const { before, after } = filterManifestPacks(target);
    console.log(`filter-manifest-packs: ${target} packs ${before} -> ${after} (kept those built in dist/packs)`);
}
