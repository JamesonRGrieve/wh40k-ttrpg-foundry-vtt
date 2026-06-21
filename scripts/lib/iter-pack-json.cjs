/**
 * Shared pack-source JSON iterator.
 *
 * Walks `<packsRoot>/<group>/<pack>/_source/*.json`, skipping group dirs that
 * start with `.` or `_`, pack dirs whose name contains `.backup`, and any pack
 * without a `_source/` directory. Yields one entry per `.json` source file.
 *
 * Authored as CommonJS so every pack-compilation consumer can share it:
 *   - `.cjs` / `gulpfile.js`  → `const { iterPackJson } = require('./lib/iter-pack-json.cjs')`
 *   - `.mjs`                  → `import pkg from './lib/iter-pack-json.cjs'; const { iterPackJson } = pkg;`
 *     (ESM default-imports a CJS module's `module.exports`)
 *
 * @param {string} packsRoot absolute path to the `src/packs` root.
 * @param {{ repoRoot?: string }} [opts] when `repoRoot` is given, `relPath` is
 *   computed relative to it; otherwise `relPath` is relative to `packsRoot`.
 * @yields {{ filePath: string, relPath: string, packName: string, group: string }}
 *   `filePath` is the absolute path to the `.json` source file; `relPath` is its
 *   path relative to `repoRoot` (or `packsRoot`); `packName` is the leaf pack
 *   dir; `group` is the group dir under `packsRoot`.
 */

const fs = require('fs');
const path = require('path');

function* iterPackJson(packsRoot, opts = {}) {
  const relBase = opts.repoRoot ?? packsRoot;
  for (const group of fs.readdirSync(packsRoot)) {
    if (group.startsWith('.') || group.startsWith('_')) continue;
    const groupPath = path.join(packsRoot, group);
    if (!fs.statSync(groupPath).isDirectory()) continue;
    for (const pack of fs.readdirSync(groupPath)) {
      const packPath = path.join(groupPath, pack);
      if (!fs.statSync(packPath).isDirectory()) continue;
      if (pack.includes('.backup')) continue;
      const sourceDir = path.join(packPath, '_source');
      if (!fs.existsSync(sourceDir)) continue;
      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(sourceDir, file);
        yield {
          filePath,
          relPath: path.relative(relBase, filePath),
          packName: pack,
          group,
        };
      }
    }
  }
}

module.exports = { iterPackJson };
