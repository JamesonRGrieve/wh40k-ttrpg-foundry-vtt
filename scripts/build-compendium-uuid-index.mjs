#!/usr/bin/env node
/**
 * Build the compendium UUID index used by the UUID-first reference system.
 *
 * Walks src/packs/<group>/<pack>/_source/*.json, resolves whole-file `reference`
 * stubs, derives the owning game-system from the pack name prefix, and emits a
 * (gameSystem, type, normalizedName) → uuid map alongside collision and orphan
 * reports.
 *
 * Output: .compendium-uuid-index.json at repo root, plus a console summary.
 *
 * Flags:
 *   --strict   exit 1 if collisions or unresolvable references are found
 *   --quiet    suppress per-collision console lines (summary only)
 *
 * The index is the foundation for Phase B+ (runtime name cache, JSON
 * migration, world data migration). At Phase A it is read-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PACK_SRC = path.join(REPO_ROOT, 'src', 'packs');
const OUT_FILE = path.join(REPO_ROOT, '.compendium-uuid-index.json');
const SYSTEM_ID = 'wh40k-rpg';

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');
const QUIET = args.has('--quiet');

/**
 * Pack-name prefix → game-system id. Order matters: longest prefix first so
 * `hb-dh2-*` resolves to `dh2` rather than the generic `homebrew` bucket.
 */
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

function detectCollectionType(folder) {
  const segment = (name) => new RegExp(`(^|-)${name}(-|$)`).test(folder);
  if (segment('actors')) return 'Actor';
  if (segment('journals')) return 'JournalEntry';
  if (segment('rolltables')) return 'RollTable';
  return 'Item';
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

function resolveReferencePath(reference, fromFile) {
  if (path.isAbsolute(reference)) return reference;
  if (reference.startsWith('src/')) return path.resolve(REPO_ROOT, reference);
  if (reference.startsWith('packs/')) return path.resolve(REPO_ROOT, 'src', reference);
  return path.resolve(path.dirname(fromFile), reference);
}

function readResolvedDoc(filePath, seen = new Set()) {
  const normalized = path.resolve(filePath);
  if (seen.has(normalized)) {
    throw new Error(`Circular pack reference: ${[...seen, normalized].join(' -> ')}`);
  }
  const raw = fs.readFileSync(normalized, 'utf8');
  const doc = JSON.parse(raw);
  if (!isReferenceStub(doc)) return doc;

  seen.add(normalized);
  const targetPath = resolveReferencePath(doc.reference, normalized);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Reference target not found: ${doc.reference} (from ${normalized})`);
  }
  return readResolvedDoc(targetPath, seen);
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

function* iterPackJson() {
  for (const group of fs.readdirSync(PACK_SRC)) {
    const groupPath = path.join(PACK_SRC, group);
    if (group.startsWith('.') || group.startsWith('_')) continue;
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
          group,
        };
      }
    }
  }
}

/**
 * Foundry's `DocumentUUIDField` rejects any id that isn't exactly 16
 * alphanumeric characters (see `isValidId` in `foundry.mjs`). An invalid
 * `_id` anywhere — top-level pack doc or embedded page / item — silently
 * breaks every reference to that entry because compendium-resync skips
 * it at index-build time.
 */
const FOUNDRY_ID_RE = /^[a-zA-Z0-9]{16}$/;

/**
 * Walk a doc collecting every embedded `_id` that violates the Foundry id
 * shape. Currently checks the top level and `pages[]` (the only embedded
 * collection we ship in compendiums that has its own ids). Effects, items
 * embedded on actors, etc. can be added here if a violation surfaces.
 */
function collectInvalidIds(doc, basePath) {
  const out = [];
  if (typeof doc._id === 'string' && !FOUNDRY_ID_RE.test(doc._id)) {
    out.push({ id: doc._id, where: 'top-level', sourcePath: basePath, name: doc.name });
  }
  if (Array.isArray(doc.pages)) {
    for (const pg of doc.pages) {
      if (pg && typeof pg._id === 'string' && !FOUNDRY_ID_RE.test(pg._id)) {
        out.push({ id: pg._id, where: `pages[]: ${pg.name ?? '?'}`, sourcePath: basePath, name: doc.name });
      }
    }
  }
  return out;
}

function main() {
  /** @type {Map<string, Map<string, Map<string, Array<{uuid: string, id: string, name: string, sourcePath: string, packName: string}>>>>} */
  const index = new Map();
  const collisions = [];
  const parseErrors = [];
  const invalidIds = [];
  let totalDocs = 0;
  let totalRefStubs = 0;

  for (const entry of iterPackJson()) {
    let doc;
    try {
      const raw = JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
      if (isReferenceStub(raw)) totalRefStubs += 1;
      doc = readResolvedDoc(entry.filePath);
    } catch (err) {
      parseErrors.push({ path: entry.relPath, error: String(err.message || err) });
      continue;
    }
    if (!doc || typeof doc !== 'object') continue;
    if (typeof doc._id !== 'string' || typeof doc.name !== 'string') {
      // Origin-path folders, malformed docs, etc. are skipped silently.
      continue;
    }
    totalDocs += 1;

    // Every embedded `_id` must be a valid Foundry id. An invalid id breaks
    // compendium-resync's name index, every cross-pack UUID reference to
    // this entry, and Foundry's own `DocumentUUIDField` validation.
    for (const violation of collectInvalidIds(doc, entry.relPath)) {
      invalidIds.push(violation);
    }

    const gameSystem = gameSystemForPack(entry.packName);
    const docKey = detectCollectionType(entry.packName);
    // Items use `doc.type` as the sub-type bucket (talent, weapon, …). Journals,
    // RollTables, and Actors have no sub-type, so we bucket them under the
    // collection type (`JournalEntry`, `RollTable`, `Actor`).
    const docType = typeof doc.type === 'string' && doc.type.length > 0 ? doc.type : docKey;
    const uuid = `Compendium.${SYSTEM_ID}.${entry.packName}.${docKey}.${doc._id}`;
    const normalized = normalizeName(doc.name);

    if (!index.has(gameSystem)) index.set(gameSystem, new Map());
    const sysBucket = index.get(gameSystem);
    if (!sysBucket.has(docType)) sysBucket.set(docType, new Map());
    const typeBucket = sysBucket.get(docType);
    if (!typeBucket.has(normalized)) typeBucket.set(normalized, []);
    typeBucket.get(normalized).push({
      uuid,
      id: doc._id,
      name: doc.name,
      sourcePath: entry.relPath,
      packName: entry.packName,
    });
  }

  // Collision detection: same (system, type, normalized-name) with multiple
  // distinct _ids. Same _id across multiple packs is homologation, not a
  // collision, and is suppressed.
  for (const [system, sysBucket] of index) {
    for (const [type, typeBucket] of sysBucket) {
      for (const [name, entries] of typeBucket) {
        const distinctIds = new Set(entries.map((e) => e.id));
        if (distinctIds.size > 1) {
          collisions.push({
            system,
            type,
            name,
            entries: entries.map((e) => ({ uuid: e.uuid, sourcePath: e.sourcePath })),
          });
        }
      }
    }
  }

  // Build the canonical (single-uuid) index: for each (system, type, name),
  // pick the lowest-sorted pack name as the canonical UUID. The full collision
  // list is preserved separately so the JSON migration can audit cases where
  // resolution is ambiguous.
  const canonical = {};
  for (const [system, sysBucket] of index) {
    canonical[system] = {};
    for (const [type, typeBucket] of sysBucket) {
      canonical[system][type] = {};
      for (const [name, entries] of typeBucket) {
        const sorted = [...entries].sort((a, b) => a.packName.localeCompare(b.packName));
        canonical[system][type][name] = sorted[0].uuid;
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    systemId: SYSTEM_ID,
    counts: {
      totalDocs,
      totalRefStubs,
      systems: Object.keys(canonical).length,
      collisions: collisions.length,
      parseErrors: parseErrors.length,
      invalidIds: invalidIds.length,
    },
    canonical,
    collisions,
    parseErrors,
    invalidIds,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));

  // Console summary
  const lines = [
    `[uuid-index] ${totalDocs} documents indexed across ${Object.keys(canonical).length} game systems`,
    `[uuid-index] ${totalRefStubs} reference stubs resolved`,
    `[uuid-index] ${collisions.length} name collisions, ${parseErrors.length} parse errors, ${invalidIds.length} invalid Foundry ids`,
    `[uuid-index] index written to ${path.relative(REPO_ROOT, OUT_FILE)}`,
  ];
  for (const line of lines) console.log(line);

  if (!QUIET && invalidIds.length > 0) {
    console.log('');
    console.log('[uuid-index] invalid Foundry ids (must match /^[a-zA-Z0-9]{16}$/):');
    for (const v of invalidIds.slice(0, 30)) {
      console.log(`  "${v.id}" (${v.id.length} chars) in ${v.where} of ${v.sourcePath} (name="${v.name ?? '?'}")`);
    }
    if (invalidIds.length > 30) console.log(`  …and ${invalidIds.length - 30} more`);
  }

  if (!QUIET && collisions.length > 0) {
    console.log('');
    console.log('[uuid-index] collisions (first 20):');
    for (const c of collisions.slice(0, 20)) {
      console.log(`  [${c.system}/${c.type}] "${c.name}" → ${c.entries.length} distinct ids`);
      for (const e of c.entries) {
        console.log(`      ${e.sourcePath}`);
      }
    }
    if (collisions.length > 20) {
      console.log(`  …and ${collisions.length - 20} more`);
    }
  }

  if (!QUIET && parseErrors.length > 0) {
    console.log('');
    console.log('[uuid-index] parse errors:');
    for (const e of parseErrors.slice(0, 10)) {
      console.log(`  ${e.path}: ${e.error}`);
    }
    if (parseErrors.length > 10) {
      console.log(`  …and ${parseErrors.length - 10} more`);
    }
  }

  // Invalid Foundry ids are always a hard failure — they silently break
  // compendium-resync's name index and Foundry's own UUID validation. There
  // is no `--strict` opt-in for this gate.
  if (invalidIds.length > 0) {
    process.exit(1);
  }
  if (STRICT && (collisions.length > 0 || parseErrors.length > 0)) {
    process.exit(1);
  }
}

main();
