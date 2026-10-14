/* eslint-env node */
/**
 * Whole-file `reference` stubs: the one definition of what a stub may carry and
 * how it compiles. The gulp pack build, the compendium UUID index and the pack
 * schema validator all read a stub through this module, so they agree on what
 * a stub compiles to.
 *
 * A stub is `{ reference: "<path>" }`, plus optional overrides that are applied
 * over the resolved canonical document:
 *
 * - `name` / `_id` / `img`: identity and presentation. They replace the body's
 *   own value: a shared body under a local name, id or art (#499).
 * - `system`: a partial overlay DEEP-merged onto the body's `system`. A stub
 *   that is the same thing as its target under extra terms carries only those
 *   terms, not a copy of the whole body. Example: a DH2 Reinforcement Character
 *   that "uses the rules from the NPC profile" in the bestiary, plus its
 *   Influence terms and Fate (Enemies Without p. 41, #77).
 *   Objects merge key by key. Arrays and scalars in the overlay replace the
 *   body's value.
 * - `addItems`: embedded items APPENDED to the body's `items`, never replacing
 *   them. They are lean compendium-joined items like any actor's. Example: the
 *   Weapon Training talents those RCs get for their standard weapons ("All have
 *   any appropriate Weapon Training talents associated with their standard
 *   weapons", Enemies Without p. 41).
 */

const fs = require('node:fs');
const path = require('node:path');

/** Top-level keys that replace the resolved body's value outright. */
const STUB_IDENTITY_KEYS = Object.freeze(['name', '_id', 'img']);

/** Every key a stub may carry besides `reference`. */
const STUB_OVERRIDE_KEYS = Object.freeze([...STUB_IDENTITY_KEYS, 'system', 'addItems']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether a parsed `_source` document is a whole-file reference stub. */
function isReferenceStub(doc) {
    return isPlainObject(doc) && typeof doc.reference === 'string';
}

/** Deep-merge `overlay` onto `base` without mutating either. */
function deepMergeOverlay(base, overlay) {
    if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay;
    const out = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        out[key] = key in base ? deepMergeOverlay(base[key], value) : value;
    }
    return out;
}

/**
 * The compiled document for a stub: its resolved target with the stub's
 * overrides applied.
 */
function applyReferenceOverrides(resolved, stub) {
    const { reference: _reference, system, addItems, ...identity } = stub;
    const out = { ...resolved, ...identity };
    if (system !== undefined) out.system = deepMergeOverlay(resolved.system ?? {}, system);
    if (addItems !== undefined) out.items = [...(Array.isArray(resolved.items) ? resolved.items : []), ...addItems];
    return out;
}

/**
 * The file a stub's `reference` names. "packs/<group>/…" and "src/packs/<group>/…"
 * name a sibling pack within the ACTIVE pack root (src/packs for the public
 * generics, src/packs-private for the copyrighted content), so they anchor at
 * `packRoot` rather than a hardcoded src/packs. Any other "src/…" path anchors at
 * `repoRoot`; a bare path is relative to the stub's own file.
 * @param {string} reference  The stub's `reference`.
 * @param {string} fromFile   Absolute path of the stub.
 * @param {{ packRoot: string, repoRoot: string }} roots  Absolute pack root and repo root.
 */
function resolveReferencePath(reference, fromFile, roots) {
    if (path.isAbsolute(reference)) return reference;
    if (reference.startsWith('packs/')) return path.resolve(roots.packRoot, reference.slice('packs/'.length));
    if (reference.startsWith('src/packs/')) return path.resolve(roots.packRoot, reference.slice('src/packs/'.length));
    if (reference.startsWith('src/')) return path.resolve(roots.repoRoot, reference);
    return path.resolve(path.dirname(fromFile), reference);
}

/**
 * A `_source` document as it compiles: a stub resolved (recursively) to its
 * target with the stub's overrides applied, any other document as written.
 * Throws on a reference cycle or a missing target.
 * @param {string} filePath  The `_source` JSON file.
 * @param {{ packRoot: string, repoRoot: string }} roots  Absolute pack root and repo root.
 */
function resolvePackSourceDocument(filePath, roots, seen = new Set()) {
    const normalizedPath = path.resolve(filePath);
    if (seen.has(normalizedPath)) {
        throw new Error(`Circular pack reference detected: ${[...seen, normalizedPath].join(' -> ')}`);
    }
    const doc = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
    if (!isReferenceStub(doc)) return doc;

    seen.add(normalizedPath);
    const targetPath = resolveReferencePath(doc.reference, normalizedPath, roots);
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Pack reference target not found: ${doc.reference} (from ${normalizedPath})`);
    }
    // Per-line overrides win over the canonical body (e.g. an RT-specific `img`).
    return applyReferenceOverrides(resolvePackSourceDocument(targetPath, roots, seen), doc);
}

module.exports = {
    STUB_IDENTITY_KEYS,
    STUB_OVERRIDE_KEYS,
    isReferenceStub,
    deepMergeOverlay,
    applyReferenceOverrides,
    resolveReferencePath,
    resolvePackSourceDocument,
};
