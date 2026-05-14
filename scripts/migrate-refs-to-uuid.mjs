#!/usr/bin/env node
/**
 * Phase C — One-time JSON migration: name-based references → UUID references.
 *
 * Walks every src/packs/<group>/<pack>/_source/*.json and, for each
 * structured reference field, resolves the stored name against the Phase A
 * index (`.compendium-uuid-index.json`) and writes the resolved UUID into
 * the file. Purely additive: existing `name` fields are preserved so Phase D
 * callers can switch to UUIDs incrementally without breaking the build.
 *
 * Fields handled:
 *   - system.prerequisites.talents  (string[] names) → adds talentsUuid string[]
 *   - system.prerequisites.skills   (string[] names) → adds skillsUuid string[]
 *   - system.grants.skills[]        adds `.uuid` per entry
 *   - system.grants.talents[]       fills `.uuid` if missing
 *   - system.grants.traits[]        fills `.uuid` if missing
 *
 * Resolution scoping:
 *   - The file's owning game system (derived from pack name prefix) is the
 *     primary index bucket. Unresolved names fall back to the `homebrew`
 *     cross-system bucket.
 *   - Specialization suffix `Foo (Bar)` falls back to `Foo` after an exact
 *     match miss, matching compendium-resync.ts behavior.
 *
 * Manifest:
 *   `.compendium-uuid-migration.json` at repo root, listing every resolution
 *   (exact / specialization-fallback / homebrew-fallback / unresolved) with
 *   source-path context. Review before merging.
 *
 * Flags:
 *   --dry        do not write JSON files; emit manifest only
 *   --verbose    log every resolution
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PACK_SRC = path.join(REPO_ROOT, 'src', 'packs');
const INDEX_FILE = path.join(REPO_ROOT, '.compendium-uuid-index.json');
const MANIFEST_FILE = path.join(REPO_ROOT, '.compendium-uuid-migration.json');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const VERBOSE = args.has('--verbose');

const SYSTEM_PREFIXES = [
  ['hb-dh1-', 'dh1'],
  ['hb-dh2-', 'dh2'],
  ['hb-bc-', 'bc'],
  ['hb-dw-', 'dw'],
  ['hb-ow-', 'ow'],
  ['hb-rt-', 'rt'],
  ['dh1-', 'dh1'],
  ['dh2-', 'dh2'],
  ['bc-', 'bc'],
  ['dw-', 'dw'],
  ['ow-', 'ow'],
  ['rt-', 'rt'],
  ['hb-', 'homebrew'],
];

function gameSystemForPack(packName) {
  for (const [prefix, system] of SYSTEM_PREFIXES) {
    if (packName.startsWith(prefix)) return system;
  }
  return 'unknown';
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

function stripSpecialization(name) {
  return name.replace(/\s*\([^)]*\)\s*$/u, '').trim();
}

/**
 * Detect the indentation unit of an existing JSON file so we can preserve
 * it on rewrite. Looks at the first non-zero-depth line. Defaults to 2 if
 * no nested structure is found.
 */
function detectIndent(raw) {
  const m = raw.match(/^([ \t]+)"/m);
  return m ? m[1] : 2;
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(`Missing ${INDEX_FILE}. Run \`pnpm packs:audit\` first.`);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

function isReferenceStub(doc) {
  return (
    doc &&
    typeof doc === 'object' &&
    !Array.isArray(doc) &&
    typeof doc.reference === 'string' &&
    Object.keys(doc).length === 1
  );
}

class Resolver {
  constructor(index) {
    this.canonical = index.canonical ?? {};
    this.stats = {
      exact: 0,
      specializationFallback: 0,
      homebrewFallback: 0,
      unresolved: 0,
    };
    /** @type {Array<{system: string, type: string, name: string, sourcePath: string}>} */
    this.unresolved = [];
  }

  /**
   * Resolve a name to a UUID, scoped first to `gameSystem`, then to
   * `homebrew`, with specialization-suffix fallback at each level.
   */
  resolve(gameSystem, typeKey, name, sourcePath) {
    const normalized = normalizeName(name);
    const tries = [
      { system: gameSystem, name: normalized, kind: 'exact' },
      { system: gameSystem, name: normalizeName(stripSpecialization(name)), kind: 'specializationFallback' },
      { system: 'homebrew', name: normalized, kind: 'homebrewFallback' },
      { system: 'homebrew', name: normalizeName(stripSpecialization(name)), kind: 'homebrewFallback' },
    ];
    for (const t of tries) {
      const bucket = this.canonical[t.system]?.[typeKey];
      if (bucket?.[t.name]) {
        this.stats[t.kind] = (this.stats[t.kind] ?? 0) + 1;
        return bucket[t.name];
      }
    }
    this.stats.unresolved += 1;
    this.unresolved.push({ system: gameSystem, type: typeKey, name, sourcePath });
    return null;
  }
}

function visitGrants(grants, resolver, gameSystem, sourcePath) {
  if (!grants || typeof grants !== 'object') return 0;
  let changed = 0;

  if (Array.isArray(grants.skills)) {
    for (const g of grants.skills) {
      if (!g || typeof g !== 'object' || typeof g.name !== 'string') continue;
      if (typeof g.uuid === 'string' && g.uuid.length > 0) continue;
      const uuid = resolver.resolve(gameSystem, 'skill', g.name, sourcePath);
      if (uuid) {
        g.uuid = uuid;
        changed += 1;
      }
    }
  }

  if (Array.isArray(grants.talents)) {
    for (const g of grants.talents) {
      if (!g || typeof g !== 'object' || typeof g.name !== 'string') continue;
      if (typeof g.uuid === 'string' && g.uuid.length > 0) continue;
      const uuid = resolver.resolve(gameSystem, 'talent', g.name, sourcePath);
      if (uuid) {
        g.uuid = uuid;
        changed += 1;
      }
    }
  }

  if (Array.isArray(grants.traits)) {
    for (const g of grants.traits) {
      if (!g || typeof g !== 'object' || typeof g.name !== 'string') continue;
      if (typeof g.uuid === 'string' && g.uuid.length > 0) continue;
      const uuid = resolver.resolve(gameSystem, 'trait', g.name, sourcePath);
      if (uuid) {
        g.uuid = uuid;
        changed += 1;
      }
    }
  }

  return changed;
}

function visitPrerequisites(prereq, resolver, gameSystem, sourcePath) {
  if (!prereq || typeof prereq !== 'object') return 0;
  let changed = 0;

  if (Array.isArray(prereq.talents) && prereq.talents.length > 0 && !Array.isArray(prereq.talentsUuid)) {
    const resolved = prereq.talents.map((n) =>
      typeof n === 'string' ? resolver.resolve(gameSystem, 'talent', n, sourcePath) : null,
    );
    if (resolved.some((v) => typeof v === 'string')) {
      prereq.talentsUuid = resolved.map((v) => v ?? '');
      changed += 1;
    }
  }

  if (Array.isArray(prereq.skills) && prereq.skills.length > 0 && !Array.isArray(prereq.skillsUuid)) {
    const resolved = prereq.skills.map((n) =>
      typeof n === 'string' ? resolver.resolve(gameSystem, 'skill', n, sourcePath) : null,
    );
    if (resolved.some((v) => typeof v === 'string')) {
      prereq.skillsUuid = resolved.map((v) => v ?? '');
      changed += 1;
    }
  }

  return changed;
}

function* iterPackJson() {
  for (const group of fs.readdirSync(PACK_SRC)) {
    if (group.startsWith('.') || group.startsWith('_')) continue;
    const groupPath = path.join(PACK_SRC, group);
    if (!fs.statSync(groupPath).isDirectory()) continue;
    for (const pack of fs.readdirSync(groupPath)) {
      const packPath = path.join(groupPath, pack);
      if (!fs.statSync(packPath).isDirectory()) continue;
      if (pack.includes('.backup')) continue;
      const sourceDir = path.join(packPath, '_source');
      if (!fs.existsSync(sourceDir)) continue;
      for (const file of fs.readdirSync(sourceDir)) {
        if (!file.endsWith('.json')) continue;
        yield {
          filePath: path.join(sourceDir, file),
          relPath: path.relative(REPO_ROOT, path.join(sourceDir, file)),
          packName: pack,
        };
      }
    }
  }
}

function main() {
  const index = loadIndex();
  const resolver = new Resolver(index);
  let filesScanned = 0;
  let filesChanged = 0;
  const changedPaths = [];

  for (const entry of iterPackJson()) {
    let raw;
    try {
      raw = fs.readFileSync(entry.filePath, 'utf8');
    } catch (err) {
      console.warn(`[migrate] read failed ${entry.relPath}: ${err.message}`);
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      console.warn(`[migrate] parse failed ${entry.relPath}: ${err.message}`);
      continue;
    }
    if (isReferenceStub(doc)) continue;
    filesScanned += 1;

    const gameSystem = gameSystemForPack(entry.packName);
    const system = doc.system && typeof doc.system === 'object' ? doc.system : null;
    if (!system) continue;

    let changed = 0;
    changed += visitGrants(system.grants, resolver, gameSystem, entry.relPath);
    changed += visitPrerequisites(system.prerequisites, resolver, gameSystem, entry.relPath);

    if (changed > 0) {
      filesChanged += 1;
      changedPaths.push(entry.relPath);
      if (!DRY) {
        const indent = detectIndent(raw);
        fs.writeFileSync(entry.filePath, JSON.stringify(doc, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
      }
      if (VERBOSE) console.log(`[migrate] ${changed} refs in ${entry.relPath}`);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY,
    counts: {
      filesScanned,
      filesChanged,
      ...resolver.stats,
    },
    changedPaths,
    unresolved: resolver.unresolved,
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  console.log(`[migrate] scanned ${filesScanned} files, changed ${filesChanged}${DRY ? ' (dry run)' : ''}`);
  console.log(`[migrate] resolutions: exact=${resolver.stats.exact} specialization=${resolver.stats.specializationFallback} homebrew=${resolver.stats.homebrewFallback} unresolved=${resolver.stats.unresolved}`);
  console.log(`[migrate] manifest: ${path.relative(REPO_ROOT, MANIFEST_FILE)}`);
}

main();
