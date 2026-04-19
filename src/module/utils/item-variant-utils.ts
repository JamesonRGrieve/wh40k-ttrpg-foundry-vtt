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

function deepClone<T>(value: T): T {
    if (typeof foundry !== 'undefined' && foundry.utils?.deepClone) {
        return foundry.utils.deepClone(value);
    }

    return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map);
}

export function normalizeGameLineKey(raw: unknown): SupportedLineKey | null {
    if (typeof raw !== 'string') return null;
    return LINE_KEY_MAP[raw] ?? null;
}

export function inferActiveGameLine(source: Record<string, unknown>, parent?: { actor?: any } | null): SupportedLineKey {
    const actorLine = normalizeGameLineKey(parent?.actor?.system?.gameSystem);
    if (actorLine) return actorLine;

    const sourceSystems = Array.isArray(source.gameSystems) ? source.gameSystems : [];
    for (const systemId of sourceSystems) {
        const normalized = normalizeGameLineKey(systemId);
        if (normalized) return normalized;
    }

    return 'rt';
}

export function isLineVariantContainer(value: unknown): value is Partial<Record<SupportedLineKey, unknown>> {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => LINE_KEYS.has(key as SupportedLineKey));
}

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
            source[key] = isPlainObject(resolved) ? materializeItemVariants(resolved, lineKey, nextPath) : (resolved as Record<string, unknown>);
            continue;
        }

        if (isPlainObject(rawValue)) {
            materializeItemVariants(rawValue, lineKey, nextPath);
        }
    }

    return source;
}

export function getMaterializedItemSource(item: WH40KItem): Record<string, unknown> {
    const source = deepClone(item?.system?._source ?? item?.system ?? {});
    const lineKey = inferActiveGameLine(source, item);
    return materializeItemVariants(source, lineKey);
}

export function remapSubmitDataToVariantPaths(item: WH40KItem, submitData: Record<string, unknown>): Record<string, unknown> {
    const systemSource = item?.system?._source;
    if (!isPlainObject(systemSource)) return submitData;

    const lineKey = inferActiveGameLine(systemSource, item);
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

function remapRelativePath(root: Record<string, unknown>, relativePath: string, lineKey: SupportedLineKey): string {
    const segments = relativePath.split('.');
    const mapped: string[] = [];
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
