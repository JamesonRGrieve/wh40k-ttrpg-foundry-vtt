import type { WH40KItem } from '../documents/item.ts';

type SupportedLineKey = 'dh1' | 'dh2' | 'rt' | 'dw' | 'bc' | 'ow';

const LINE_KEY_MAP: Record<string, SupportedLineKey> = {
    dh1: 'dh1',
    dh1e: 'dh1',
    dh2: 'dh2',
    dh2e: 'dh2',
    rt: 'rt',
    dw: 'dw',
    bc: 'bc',
    ow: 'ow',
};

const LINE_KEYS = new Set<SupportedLineKey>(['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow']);
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

// eslint-disable-next-line no-restricted-syntax -- boundary: source and parent are untyped Foundry DataModel context
export function inferActiveGameLine(source: Record<string, unknown>, parent?: { actor?: unknown } | null): SupportedLineKey {
    // eslint-disable-next-line no-restricted-syntax -- boundary: parent.actor is typed unknown (Foundry DataModel parent context); narrowed via typeof guard above
    const actorSystem = parent?.actor !== null && typeof parent?.actor === 'object' ? (parent.actor as { system?: Record<string, unknown> }).system : undefined;
    const actorLine = normalizeGameLineKey(actorSystem?.['gameSystem']);
    if (actorLine !== null) return actorLine;

    const sourceSystems = Array.isArray(source['gameSystems']) ? source['gameSystems'] : [];
    for (const systemId of sourceSystems) {
        const normalized = normalizeGameLineKey(systemId);
        if (normalized !== null) return normalized;
    }

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
    for (const key of ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow'] as const) {
        if (value[key] !== undefined && value[key] !== null) return value[key];
    }
    return undefined;
}

export function resolveLineVariant<T>(value: T, lineKey: SupportedLineKey): T {
    if (!isLineVariantContainer(value)) return value;
    const branch = value[lineKey] ?? firstDefinedVariant(value);
    return (branch === undefined ? value : deepClone(branch)) as T;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: source is untyped Foundry item system data
export function materializeItemVariants(source: Record<string, unknown>, lineKey: SupportedLineKey, path: string[] = []): Record<string, unknown> {
    if (!isPlainObject(source)) return source;

    for (const [key, rawValue] of Object.entries(source)) {
        const nextPath = [...path, key];
        if (SHARED_LINE_OBJECT_KEYS.has(key)) {
            if (isPlainObject(rawValue)) materializeItemVariants(rawValue, lineKey, nextPath);
            continue;
        }

        if (isLineVariantContainer(rawValue)) {
            const resolved = resolveLineVariant(rawValue, lineKey);
            source[key] = isPlainObject(resolved) ? materializeItemVariants(resolved, lineKey, nextPath) : resolved;
            continue;
        }

        if (isPlainObject(rawValue)) {
            materializeItemVariants(rawValue, lineKey, nextPath);
        }
    }

    return source;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: item system data is untyped Foundry DataModel; return type is narrow at call sites
export function getMaterializedItemSource(item: WH40KItem): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
    const rawSystem = item.system as Record<string, unknown> | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item._source is untyped Foundry DataModel source data
    const rawSource = rawSystem?.['_source'] as Record<string, unknown> | undefined;
    const source = deepClone(rawSource ?? rawSystem ?? {});
    const lineKey = inferActiveGameLine(source, item);
    return materializeItemVariants(source, lineKey);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: submitData is untyped form submission data
export function remapSubmitDataToVariantPaths(item: WH40KItem, submitData: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
    const systemSource = (item.system as Record<string, unknown> | undefined)?.['_source'];
    if (!isPlainObject(systemSource)) return submitData;

    const lineKey = inferActiveGameLine(systemSource, item);
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
