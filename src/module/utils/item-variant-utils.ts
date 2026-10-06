import { WH40KSettings } from '../wh40k-rpg-settings.ts';

export type SupportedLineKey = 'dh1' | 'dh2' | 'rt' | 'dw' | 'bc' | 'ow' | 'im';

/**
 * Minimal item surface the variant helpers read. Structural (not the `WH40KItem`
 * Document) on purpose: a util importing a Document would form an import cycle
 * (documents → data → utils → documents). A `WH40KItem` satisfies this shape.
 */
interface VariantItemLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry item system payload
    system?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry parent actor context
    actor?: unknown;
}

/** A document's untyped Foundry `system` payload (variant resolution boundary). */
// eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry item system data
type ItemSystemSource = Record<string, unknown>;

const LINE_KEY_MAP: Record<string, SupportedLineKey> = {
    dh1: 'dh1',
    dh2: 'dh2',
    rt: 'rt',
    dw: 'dw',
    bc: 'bc',
    ow: 'ow',
    im: 'im',
};

const LINE_KEYS = new Set<SupportedLineKey>(['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow', 'im']);
const SHARED_LINE_OBJECT_KEYS = new Set(['cost']);

// eslint-disable-next-line @typescript-eslint/no-shadow -- intentional local shim for Foundry's deepClone; safe in this module
function deepClone<T>(value: T): T {
    if (typeof foundry !== 'undefined' && typeof foundry.utils.deepClone === 'function') {
        return foundry.utils.deepClone(value);
    }

    return structuredClone(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown input at module entry
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: raw is untyped Foundry system data
export function normalizeGameLineKey(raw: unknown): SupportedLineKey | null {
    if (typeof raw !== 'string') return null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess guard for strict tsconfig
    return (LINE_KEY_MAP[raw] as SupportedLineKey | undefined) ?? null;
}

/**
 * The game line an item OWNER (an actor document, or a raw actor source) belongs
 * to, or `null` when it names none.
 *
 * The actor's type is authoritative: every per-line actor type is
 * `<line>-<role>` (`bc-character`, `dh1-npc`), and its DataModel's static
 * `gameSystem` is that same prefix. Only the legacy unprefixed types
 * (`character`, `npc`) fall back to the persisted `system.gameSystem` — an NPC's
 * system has no such field at all, which is why reading it alone resolved every
 * NPC-owned item to the world line.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the owner is an untyped Foundry actor document or raw actor source
export function ownerGameLine(owner: unknown): SupportedLineKey | null {
    if (owner === null || typeof owner !== 'object') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: narrowed to an object above; Foundry actor documents and raw sources share these two keys
    const { type, system } = owner as { type?: unknown; system?: unknown };
    const typeLine = typeof type === 'string' ? normalizeGameLineKey(type.split('-')[0]) : null;
    if (typeLine !== null) return typeLine;
    if (system === null || typeof system !== 'object') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor system is an untyped DataModel or raw source object
    return normalizeGameLineKey((system as { gameSystem?: unknown }).gameSystem);
}

// Resolve the active line for variant materialization. Owned items follow
// their actor's line; otherwise the world's primary game system is the
// authoritative hint (per-item coverage already lives in the variant-container
// keys, so no `gameSystems` list is consulted). Falls back to 'rt'.
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel parent.actor is untyped (unknown) framework context
export function inferActiveGameLine(parent?: { actor?: unknown } | null): SupportedLineKey {
    const actorLine = ownerGameLine(parent?.actor);
    if (actorLine !== null) return actorLine;

    const worldLine = normalizeGameLineKey(WH40KSettings.getPrimaryGameSystem());
    if (worldLine !== null) return worldLine;

    return 'rt';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown input
export function isLineVariantContainer(value: unknown): value is Partial<Record<SupportedLineKey, unknown>> {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => LINE_KEYS.has(key as SupportedLineKey));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: returns unknown variant data from untyped item system
function firstDefinedVariant(value: Partial<Record<SupportedLineKey, unknown>>): unknown {
    for (const key of ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow', 'im'] as const) {
        if (value[key] !== undefined && value[key] !== null) return value[key];
    }
    return undefined;
}

/**
 * When the active line has no branch in a variant container, the correct
 * fallback is the line whose `system.source.<line>.provenance` is `raw` — the
 * authoritative printing the others adapt from — NOT an arbitrary id-order
 * pick. This keeps a homebrew conversion (e.g. a `dh2` homebrew branch) from
 * leaking onto sibling lines that merely reference the canonical: those lines
 * fall back to the RAW line's stats, while the active line that owns a branch
 * still gets its own. `rawLines` is derived from the document's source map
 * (see `rawProvenanceLines`); an empty list reverts to `firstDefinedVariant`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: returns untyped variant payload from item system data
function firstRawVariant(value: Partial<Record<SupportedLineKey, unknown>>, rawLines: readonly SupportedLineKey[]): unknown {
    for (const line of rawLines) {
        if (value[line] !== undefined && value[line] !== null) return value[line];
    }
    return undefined;
}

/**
 * The line ids whose `provenance` is `raw` in a document's `system.source`
 * map, in canonical id order. Used as the variant-resolution fallback so that
 * unauthored lines inherit the official printing rather than a homebrew
 * conversion branch.
 */
export function rawProvenanceLines(systemSource: ItemSystemSource): SupportedLineKey[] {
    const sourceMap = systemSource['source'];
    if (!isPlainObject(sourceMap)) return [];
    const lines: SupportedLineKey[] = [];
    for (const line of LINE_KEYS) {
        const entry = sourceMap[line];
        if (isPlainObject(entry) && entry['provenance'] === 'raw') lines.push(line);
    }
    return lines;
}

/**
 * Book-variant container: holds the same item attribute as published by
 * multiple books of the SAME line (FFG re-printed items with divergent stats),
 * keyed by book slug under `__books`, with `__canonical` naming the primary
 * book to use at runtime. The other books' RAW data is retained on disk. This
 * is a second variant axis nested inside (or independent of) the per-line axis.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown input from untyped item system data
function isBookVariantContainer(value: unknown): value is { __books: Record<string, unknown>; __canonical?: string } {
    return isPlainObject(value) && isPlainObject(value['__books']);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: returns the canonical book's untyped payload from an item system book-variant container
function resolveBookVariant(value: { __books: Record<string, unknown>; __canonical?: string }): unknown {
    const books = value.__books;
    const canonical = value.__canonical;
    if (typeof canonical === 'string' && books[canonical] !== undefined && books[canonical] !== null) return books[canonical];
    for (const book of Object.keys(books)) {
        if (books[book] !== undefined && books[book] !== null) return books[book];
    }
    return undefined;
}

/**
 * Outcome of resolving one per-line variant container.
 *
 * `resolved: false` means the container could NOT be collapsed — the value is
 * handed back untouched, which is still a container object. That distinction is
 * invisible to `resolveLineVariant`'s callers (it returns its input on failure),
 * and coercing the passed-through container is how a weapon authored
 * `melee: false` in every line became melee: `Boolean({dh1: false, dh2: false})`
 * is `true` (#503).
 */
export interface LineVariantResolution<T> {
    /** True when a branch was genuinely selected. */
    resolved: boolean;
    /** The selected branch, or the original value when unresolved. */
    value: T;
}

/**
 * Resolve a per-line variant container, reporting whether it actually resolved.
 *
 * Prefer this over {@link resolveLineVariant} for any value that will be coerced
 * (`Boolean(...)`, `Number(...)`, an enum check) or that gates behaviour — an
 * unresolved container must be treated as an error, never coerced.
 * @param {T} value  A scalar, or a per-line / per-book variant container.
 * @param {SupportedLineKey} lineKey  Active game line.
 * @param {readonly SupportedLineKey[]} [rawLines]  Raw-provenance fallback lines.
 * @returns {LineVariantResolution<T>}  The branch plus whether it resolved.
 */
export function tryResolveLineVariant<T>(value: T, lineKey: SupportedLineKey, rawLines: readonly SupportedLineKey[] = []): LineVariantResolution<T> {
    const isContainer = isLineVariantContainer(value) || isBookVariantContainer(value);
    // eslint-disable-next-line no-restricted-syntax -- boundary: branch holds untyped variant payload (line then book) resolved from item system data
    let branch: unknown = value;
    if (isLineVariantContainer(value)) branch = value[lineKey] ?? firstRawVariant(value, rawLines) ?? firstDefinedVariant(value);
    if (isBookVariantContainer(branch)) branch = resolveBookVariant(branch);
    // A scalar input is trivially "resolved" — there was nothing to collapse.
    if (!isContainer) return { resolved: true, value };
    if (branch === undefined || branch === value) return { resolved: false, value };
    return { resolved: true, value: deepClone(branch) as T };
}

/**
 * Resolve a per-line variant container to its active-line branch.
 *
 * Returns the input unchanged when it cannot resolve, which makes failure
 * indistinguishable from success at the call site — use
 * {@link tryResolveLineVariant} wherever that distinction matters.
 * @param {T} value  A scalar, or a per-line / per-book variant container.
 * @param {SupportedLineKey} lineKey  Active game line.
 * @param {readonly SupportedLineKey[]} [rawLines]  Raw-provenance fallback lines.
 * @returns {T}  The resolved branch, or the original value.
 */
export function resolveLineVariant<T>(value: T, lineKey: SupportedLineKey, rawLines: readonly SupportedLineKey[] = []): T {
    return tryResolveLineVariant(value, lineKey, rawLines).value;
}

export function materializeItemVariants(
    source: ItemSystemSource,
    lineKey: SupportedLineKey,
    path: string[] = [],
    rawLines?: readonly SupportedLineKey[],
): ItemSystemSource {
    if (!isPlainObject(source)) return source;

    // Derive the raw-provenance fallback lines once, from the top-level system
    // source map, before the `source` field is itself collapsed below. Threaded
    // into every nested resolution so unauthored lines inherit the official
    // printing rather than a homebrew conversion branch.
    const fallbackLines = rawLines ?? (path.length === 0 ? rawProvenanceLines(source) : []);

    for (const [key, rawValue] of Object.entries(source)) {
        const nextPath = [...path, key];
        if (SHARED_LINE_OBJECT_KEYS.has(key)) {
            if (isPlainObject(rawValue)) materializeItemVariants(rawValue, lineKey, nextPath, fallbackLines);
            continue;
        }

        if (isLineVariantContainer(rawValue) || isBookVariantContainer(rawValue)) {
            const resolved = resolveLineVariant(rawValue, lineKey, fallbackLines);
            source[key] = isPlainObject(resolved) ? materializeItemVariants(resolved, lineKey, nextPath, fallbackLines) : resolved;
            continue;
        }

        if (isPlainObject(rawValue)) {
            materializeItemVariants(rawValue, lineKey, nextPath, fallbackLines);
        }
    }

    return source;
}

/**
 * Flatten per-game-line variant containers on a raw `_migrateData` source payload
 * down to the world's active game line, in place. Handles both shapes Foundry
 * passes: the inner `system` payload, or the whole document (with `system` nested).
 * The on-disk JSON is untouched — only the in-memory source is flattened. Shared by
 * {@link ItemDataModel} and {@link ActorDataModel} `_migrateData`: a homologated
 * canonical carrying per-line variant containers must resolve to the current line,
 * or Foundry strips the unknown line keys and falls back to schema initials
 * ("all zeros"). No parent context at migration time, so the line is the world's
 * primary game system.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData source is untyped Foundry payload before schema validation
export function flattenSourceLineVariants(source: Record<string, unknown>): void {
    const lineKey = inferActiveGameLine();
    const systemContainer = source['system'];
    materializeItemVariants(isPlainObject(systemContainer) ? systemContainer : source, lineKey);
}

/**
 * Resolve every embedded item's per-line variant containers on a raw ACTOR
 * source to that actor's own line, in place.
 *
 * Runs from the actor document's `migrateData`, which Foundry calls on the whole
 * actor source before it recurses into the embedded `items` collection. Each
 * item's own `ItemDataModel._migrateData` runs later with no actor context and
 * would collapse the containers to the WORLD line; materializing them here first
 * leaves it nothing to collapse. A no-op for an actor whose type names no line.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: actor migrateData source is untyped Foundry payload before schema validation
export function materializeOwnedItemSources(actorSource: Record<string, unknown>): void {
    const line = ownerGameLine(actorSource);
    const items = actorSource['items'];
    if (line === null || !Array.isArray(items)) return;
    for (const item of items) {
        if (isPlainObject(item) && isPlainObject(item['system'])) materializeItemVariants(item['system'], line);
    }
}

/** Does any value in this system payload (at any depth) carry a per-line variant container? */
// eslint-disable-next-line no-restricted-syntax -- boundary: walks an untyped Foundry system payload
export function hasLineVariantContainers(value: unknown): boolean {
    if (!isPlainObject(value)) return false;
    if (isLineVariantContainer(value)) return true;
    return Object.values(value).some((child) => hasLineVariantContainers(child));
}

/**
 * The paths (relative to `system`) of every per-line variant container in a raw
 * system payload, walked exactly as {@link materializeItemVariants} walks it: a
 * container is one unit (its branches may nest further containers), shared-line
 * objects (`cost`) are descended into, and book containers are not line-keyed.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: walks an untyped Foundry system payload
export function lineVariantPaths(system: unknown, path: readonly string[] = []): string[][] {
    if (!isPlainObject(system)) return [];
    const paths: string[][] = [];
    for (const [key, value] of Object.entries(system)) {
        const nextPath = [...path, key];
        if (!SHARED_LINE_OBJECT_KEYS.has(key) && isLineVariantContainer(value)) paths.push(nextPath);
        else paths.push(...lineVariantPaths(value, nextPath));
    }
    return paths;
}

/**
 * Order-insensitive structural equality over source data (plain objects, arrays,
 * primitives). Key order is irrelevant because merges and schema cleaning both
 * reorder keys.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: compares two untyped Foundry source payloads, `unknown` at every depth by construction
export function sameSourceValue(a: unknown, b: unknown): boolean {
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        return [...keys].every((key) => sameSourceValue(a[key], b[key]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((value, index) => sameSourceValue(value, b[index]));
    }
    return a === b;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: reads one path of an untyped Foundry source payload
function valueAtPath(root: unknown, path: readonly string[]): unknown {
    // eslint-disable-next-line no-restricted-syntax -- boundary: cursor walks an untyped Foundry source payload
    let cursor: unknown = root;
    for (const segment of path) {
        if (!isPlainObject(cursor)) return undefined;
        cursor = cursor[segment];
    }
    return cursor;
}

/**
 * Re-point an owned item's line content from the world line to its owner's.
 *
 * `persisted` is an owned item's system as it was stored; when it was copied
 * from the canonical while that canonical was flattened to the WORLD line (every
 * compendium drag/drop, `fromCompendium`, and every item created before owned
 * items resolved to their actor), each variant path holds the world line's value.
 * At each variant path of `pristine` (the canonical's unflattened system):
 *
 *  - if `persisted` still equals the world line's resolution (`worldFlat`), the
 *    value is an unedited copy of line content — it takes the owner line's
 *    resolution (`ownerFlat`);
 *  - otherwise the actor customised it (or it is already the owner's value) and
 *    it is kept: "persisted wins" holds for everything genuinely authored.
 *
 * Pure; returns a copy and never touches its inputs.
 */
/* eslint-disable no-restricted-syntax -- boundary: all four are untyped Foundry item system payloads */
export function rebaseLineVariantContent(
    pristine: ItemSystemSource,
    worldFlat: ItemSystemSource,
    ownerFlat: ItemSystemSource,
    persisted: ItemSystemSource,
): ItemSystemSource {
    /* eslint-enable no-restricted-syntax */
    const out = deepClone(persisted);
    for (const path of lineVariantPaths(pristine)) {
        const current = valueAtPath(out, path);
        const ownerValue = valueAtPath(ownerFlat, path);
        if (current === undefined || ownerValue === undefined) continue;
        const worldValue = valueAtPath(worldFlat, path);
        if (!sameSourceValue(current, worldValue) || sameSourceValue(ownerValue, worldValue)) continue;
        const parent = valueAtPath(out, path.slice(0, -1));
        const leaf = path.at(-1);
        if (isPlainObject(parent) && leaf !== undefined) parent[leaf] = deepClone(ownerValue);
    }
    return out;
}

/**
 * A canonical item document as the owner-line resolution reads it: its type
 * (which names the system DataModel) and its flattened stored source.
 */
interface LineVariantDocument {
    type: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry document source system
    _source?: { system?: Record<string, unknown> } | undefined;
}

/** Cleans a raw, line-flattened system payload through the item type's DataModel. */
type SystemSourceCleaner = (type: string, system: ItemSystemSource) => ItemSystemSource;

/**
 * Each item document's system payload as it was BEFORE `_migrateData` collapsed
 * its per-line variant containers to the world line. Recorded only for
 * documents that actually carry containers (canonical compendium and world
 * items, in practice), in memory, keyed weakly by the document so it lives
 * exactly as long as the document does. Nothing here is ever persisted.
 */
const PRISTINE_LINE_SOURCES = new WeakMap<object, ItemSystemSource>();

/** Per-document cache of the cleaned owner-line resolution, one entry per line. */
const OWNER_LINE_SYSTEMS = new WeakMap<object, Map<SupportedLineKey, ItemSystemSource>>();

/**
 * Remember a document's unflattened system payload (a no-op when it carries no
 * per-line containers). Called with the raw source as Foundry constructs the
 * document, before the schema's migration collapses the containers.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: raw Foundry construction source, before schema validation
export function rememberLineVariantSource(document: object, system: unknown): void {
    if (!isPlainObject(system) || !hasLineVariantContainers(system)) return;
    PRISTINE_LINE_SOURCES.set(document, deepClone(system));
    OWNER_LINE_SYSTEMS.delete(document);
}

/** The unflattened system payload recorded for a document, if it carried line variants. */
export function lineVariantSourceOf(document: object): ItemSystemSource | undefined {
    return PRISTINE_LINE_SOURCES.get(document);
}

/**
 * The production cleaner: the item type's system DataModel, which migrates
 * (now a no-op flatten, since no containers remain) and cleans the payload
 * exactly as Foundry does for a stored item, so the result is comparable to
 * a `_source.system`.
 */
function cleanThroughSystemModel(type: string, system: ItemSystemSource): ItemSystemSource {
    // Headless tooling and unit tests run without Foundry's CONFIG global.
    if (!('CONFIG' in globalThis)) return system;
    // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.Item.dataModels is the untyped Foundry registry of system DataModel classes
    const model = (CONFIG.Item.dataModels as Record<string, { cleanData?: (source: ItemSystemSource) => ItemSystemSource } | undefined>)[type];
    return typeof model?.cleanData === 'function' ? model.cleanData(system) : system;
}

/**
 * A canonical item's system resolved for one line, cleaned as a stored source —
 * or `null` when the document carried no per-line containers (its flattened
 * source is then already correct for every line). Cached per document and line.
 */
export function canonicalSystemForLine(
    document: LineVariantDocument,
    line: SupportedLineKey,
    clean: SystemSourceCleaner = cleanThroughSystemModel,
): ItemSystemSource | null {
    const pristine = PRISTINE_LINE_SOURCES.get(document);
    if (pristine === undefined) return null;
    let byLine = OWNER_LINE_SYSTEMS.get(document);
    if (byLine === undefined) {
        byLine = new Map();
        OWNER_LINE_SYSTEMS.set(document, byLine);
    }
    const cached = byLine.get(line);
    if (cached !== undefined) return cached;
    const resolved = clean(document.type, materializeItemVariants(deepClone(pristine), line));
    byLine.set(line, resolved);
    return resolved;
}

/** An owned item's canonical base layer and its re-pointed persisted overlay, for one owner line. */
export interface OwnedLineContent {
    /** The canonical system resolved for the owner's line (the join's base layer). */
    base: ItemSystemSource;
    /** The persisted system with unedited world-line copies swapped for the owner's line. */
    overlay: ItemSystemSource;
}

/**
 * Resolve an owned item's line content against its canonical document for the
 * owner's line. `null` when the canonical carries no per-line containers, in
 * which case the caller's existing (line-agnostic) behaviour is already right.
 */
export function resolveOwnedLineContent(
    canonical: LineVariantDocument,
    persisted: ItemSystemSource,
    line: SupportedLineKey,
    clean: SystemSourceCleaner = cleanThroughSystemModel,
): OwnedLineContent | null {
    const pristine = PRISTINE_LINE_SOURCES.get(canonical);
    const base = canonicalSystemForLine(canonical, line, clean);
    if (pristine === undefined || base === null) return null;
    const worldFlat = canonical._source?.system ?? {};
    return { base, overlay: rebaseLineVariantContent(pristine, worldFlat, base, persisted) };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: item system data is untyped Foundry DataModel; return type is narrow at call sites
export function getMaterializedItemSource(item: VariantItemLike): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
    const rawSystem = item.system as Record<string, unknown> | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item._source is untyped Foundry DataModel source data
    const rawSource = rawSystem?.['_source'] as Record<string, unknown> | undefined;
    const source = deepClone(rawSource ?? rawSystem ?? {});
    const lineKey = inferActiveGameLine(item);
    return materializeItemVariants(source, lineKey);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: submitData is untyped form submission data
export function remapSubmitDataToVariantPaths(item: VariantItemLike, submitData: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
    const systemSource = (item.system as Record<string, unknown> | undefined)?.['_source'];
    if (!isPlainObject(systemSource)) return submitData;

    const lineKey = inferActiveGameLine(item);
    // eslint-disable-next-line no-restricted-syntax -- boundary: remapped holds untyped remapped form data
    const remapped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(submitData)) {
        if (!key.startsWith('system.')) {
            remapped[key] = value;
            continue;
        }

        const relativePath = key.slice('system.'.length);
        const mappedPath = remapRelativePath(systemSource, relativePath, lineKey);
        remapped[`system.${mappedPath}`] = value;
    }

    return remapped;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: root is untyped item system source
function remapRelativePath(root: Record<string, unknown>, relativePath: string, lineKey: SupportedLineKey): string {
    const segments = relativePath.split('.');
    const mapped: string[] = [];
    // eslint-disable-next-line no-restricted-syntax -- boundary: cursor traverses untyped item system data
    let cursor: unknown = root;
    let currentField = '';

    for (const segment of segments) {
        if (isLineVariantContainer(cursor) && !SHARED_LINE_OBJECT_KEYS.has(currentField)) {
            mapped.push(lineKey);
            cursor = cursor[lineKey] ?? firstDefinedVariant(cursor);
        }

        mapped.push(segment);
        currentField = segment;

        if (isPlainObject(cursor) && segment in cursor) {
            cursor = cursor[segment];
        } else {
            cursor = undefined;
        }
    }

    return mapped.join('.');
}
