// Shared recursive file enumerator for the build/coverage/ratchet scripts.
//
// A single depth-first `readdirSync` walk replaces the ~16 hand-rolled copies
// that drifted on exclusion sets. Traversal order matches the historical
// generators exactly (depth-first, in raw `readdirSync` order), so any call
// site that sorts the result afterwards keeps producing byte-identical output.
//
//   walkFiles(dir)                                  → every file under dir
//   walkFiles(dir, { ext: '.hbs' })                 → files ending in .hbs
//   walkFiles(dir, { ext: ['.ts', '.js'] })         → files ending in .ts or .js
//   walkFiles(dir, { ext: '.ts', exclude: ['.d.ts', '.test.ts'] })
//
// `ext` and `exclude` are matched with `name.endsWith(...)` (a single string or
// an array of strings), mirroring the original call sites. A missing directory
// yields nothing rather than throwing — a safe superset of the prior behaviour
// (the guarded call sites returned early; the unguarded ones only ran against
// directories that always exist).

import { readdirSync, statSync } from 'node:fs';

function toList(value) {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : [value];
}

function matchesAny(name, suffixes) {
    return suffixes.some((s) => name.endsWith(s));
}

/**
 * Recursively yield absolute-or-relative file paths under `dir` (depth-first).
 *
 * @param {string} dir Directory to walk. Joined with '/'; relative dirs stay relative.
 * @param {{ ext?: string | string[], exclude?: string | string[] }} [options]
 * @returns {Generator<string>}
 */
export function* walkFiles(dir, { ext, exclude } = {}) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return; // missing directory → no files
    }

    const extList = toList(ext);
    const excludeList = toList(exclude);

    for (const name of entries) {
        const full = `${dir}/${name}`;
        const stat = statSync(full);
        if (stat.isDirectory()) {
            yield* walkFiles(full, { ext, exclude });
            continue;
        }
        if (!stat.isFile()) continue;
        if (extList && !matchesAny(name, extList)) continue;
        if (excludeList && matchesAny(name, excludeList)) continue;
        yield full;
    }
}
