import { WH40KSettings } from '../wh40k-rpg-settings.ts';

type SupportedLineKey = 'dh1' | 'dh2' | 'rt' | 'dw' | 'bc' | 'ow' | 'im';

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

// Resolve the active line for variant materialization. Owned items follow
// their actor's line; otherwise the world's primary game system is the
// authoritative hint (per-item coverage already lives in the variant-container
// keys, so no `gameSystems` list is consulted). Falls back to 'rt'.
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel parent.actor is untyped (unknown) framework context
export function inferActiveGameLine(parent?: { actor?: unknown } | null): SupportedLineKey {
    // eslint-disable-next-line no-restricted-syntax -- boundary: parent.actor is typed unknown (Foundry DataModel parent context); narrowed via typeof guard above
    const actorSystem = parent?.actor !== null && typeof parent?.actor === 'object' ? (parent.actor as { system?: Record<string, unknown> }).system : undefined;
    const actorLine = normalizeGameLineKey(actorSystem?.['gameSystem']);
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

export function resolveLineVariant<T>(value: T, lineKey: SupportedLineKey, rawLines: readonly SupportedLineKey[] = []): T {
    // eslint-disable-next-line no-restricted-syntax -- boundary: branch holds untyped variant payload (line then book) resolved from item system data
    let branch: unknown = value;
    if (isLineVariantContainer(value)) branch = value[lineKey] ?? firstRawVariant(value, rawLines) ?? firstDefinedVariant(value);
    if (isBookVariantContainer(branch)) branch = resolveBookVariant(branch);
    return branch === undefined || branch === value ? value : (deepClone(branch) as T);
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
