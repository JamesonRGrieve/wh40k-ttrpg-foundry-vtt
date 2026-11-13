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
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { iterPackJson } = require('./lib/iter-pack-json.cjs');
// Any stub (bare, identity override or `system` overlay) owns no references of its
// own to migrate; its body does.
const { isReferenceStub } = require('./lib/pack-reference.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
// The content root: the public packs by default; WH40K_PACKS_SRC=src/packs-private
// migrates the private content (build the index from the same root first).
const PACK_SRC = path.resolve(REPO_ROOT, process.env.WH40K_PACKS_SRC || path.join('src', 'packs'));
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

/** "Unnatural <Characteristic> (+N | xN | N)": the characteristic and N. */
const UNNATURAL_RE =
  /^Unnatural (Weapon Skill|Ballistic Skill|Strength|Toughness|Agility|Intelligence|Perception|Willpower|Fellowship)\s*\(\s*[+x×]?\s*(\d+)\s*\)$/u;
/** The names a line gives its single Unnatural Characteristic trait. */
const UNNATURAL_BASES = ['Unnatural Characteristic (X)', 'Unnatural Characteristic (+X)', 'Unnatural Characteristic'];

/** The trailing bracket of `Foo (Bar)`, or '' when there is none. */
function specializationOf(name) {
  const m = String(name).match(/\(([^)]*)\)\s*$/u);
  return m ? m[1].trim() : '';
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
  resolve(gameSystem, typeKey, name, sourcePath, { quiet = false } = {}) {
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
        this.lastStripped = t.name !== normalized;
        return bucket[t.name];
      }
    }
    if (quiet) return null;
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
        // "Heightened Senses (Hearing)" resolved to the generic talent: the
        // bracket is the specialisation the builder stamps on the granted copy.
        if (resolver.lastStripped && (typeof g.specialization !== 'string' || g.specialization === '')) {
          g.specialization = specializationOf(g.name);
        }
        changed += 1;
      }
    }
  }

  if (Array.isArray(grants.traits)) {
    for (const g of grants.traits) {
      if (!g || typeof g !== 'object' || typeof g.name !== 'string') continue;
      if (typeof g.uuid === 'string' && g.uuid.length > 0) continue;
      // "Unnatural Strength (+4)" is the line's one Unnatural Characteristic
      // trait, specialised to Strength, at level 4 (the SPEC model, #261).
      const unnatural = UNNATURAL_RE.exec(g.name);
      if (unnatural) {
        const uuid = UNNATURAL_BASES.map((base) => resolver.resolve(gameSystem, 'trait', base, sourcePath, { quiet: true })).find(Boolean);
        if (uuid) {
          g.uuid = uuid;
          if (typeof g.specialization !== 'string' || g.specialization === '') g.specialization = unnatural[1];
          if (typeof g.level !== 'number') g.level = Number(unnatural[2]);
          resolver.stats.exact += 1;
          changed += 1;
          continue;
        }
      }
      const uuid = resolver.resolve(gameSystem, 'trait', g.name, sourcePath);
      if (uuid) {
        g.uuid = uuid;
        // "Fear (2)" resolved to Fear: a numeric bracket is the trait's level;
        // any other bracket is its specialisation.
        if (resolver.lastStripped) {
          const bracket = specializationOf(g.name);
          const level = /^[+x×]?(\d+)$/u.exec(bracket);
          if (level && typeof g.level !== 'number') g.level = Number(level[1]);
          else if (!level && (typeof g.specialization !== 'string' || g.specialization === '')) g.specialization = bracket;
        }
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

function main() {
  const index = loadIndex();
  const resolver = new Resolver(index);
  let filesScanned = 0;
  let filesChanged = 0;
  const changedPaths = [];

  for (const entry of iterPackJson(PACK_SRC, { repoRoot: REPO_ROOT })) {
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
