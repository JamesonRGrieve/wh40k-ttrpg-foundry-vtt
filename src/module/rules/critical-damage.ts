export interface CriticalDamageTable {
    [key: string]: {
        [key: string]: {
            [key: number]: string;
        };
    };
}

const CRITICAL_INJURY_PACK = 'wh40k-rpg.dh2-core-stats-critical-injuries';

type ConsolidatedEffect = { text?: string | null; permanent?: boolean };
type ConsolidatedCriticalInjuryItem = {
    system?: {
        damageType?: string;
        bodyPart?: string;
        effects?: Record<string, ConsolidatedEffect>;
    };
};

let CACHED_TABLE_PROMISE: Promise<CriticalDamageTable> | null = null;

/**
 * Build the damageType × bodyPart × severity lookup from the
 * `criticalInjury` items in the compendium pack. Text for every result lives
 * in the private packs submodule (GW-copyrighted); if the pack isn't
 * installed, the returned table is empty and callers should degrade to a
 * minimal fallback string.
 */
export async function loadCriticalDamageTable(): Promise<CriticalDamageTable> {
    if (CACHED_TABLE_PROMISE !== null) return CACHED_TABLE_PROMISE;
    const promise = buildCriticalDamageTable();
    CACHED_TABLE_PROMISE = promise;
    try {
        return await promise;
    } catch (err) {
        CACHED_TABLE_PROMISE = null;
        throw err;
    }
}

async function buildCriticalDamageTable(): Promise<CriticalDamageTable> {
    const pack = game.packs.get(CRITICAL_INJURY_PACK);
    if (pack === undefined) return {};
    const docs = (await pack.getDocuments()) as ConsolidatedCriticalInjuryItem[];
    const table: CriticalDamageTable = {};
    for (const doc of docs) {
        const dt = normalizeKey(doc.system?.damageType);
        const bp = normalizeKey(doc.system?.bodyPart);
        if (dt === null || bp === null) continue;
        table[dt] ??= {};
        const dtRow = table[dt];
        dtRow[bp] ??= {};
        const bpRow = dtRow[bp];
        const effects = doc.system?.effects ?? {};
        for (const [severityStr, effect] of Object.entries(effects)) {
            const severity = Number.parseInt(severityStr, 10);
            if (!Number.isFinite(severity)) continue;
            const raw = effect.text ?? '';
            bpRow[severity] = stripOuterParagraph(raw);
        }
    }
    return table;
}

/** Discard the cached lookup — call after editing pack items at runtime. */
export function invalidateCriticalDamageCache(): void {
    CACHED_TABLE_PROMISE = null;
}

function normalizeKey(value: string | undefined): string | null {
    if (typeof value !== 'string' || value === '') return null;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function stripOuterParagraph(html: string): string {
    const trimmed = html.trim();
    const match = /^<p>([\s\S]*?)<\/p>$/.exec(trimmed);
    return match !== null && match[1] !== undefined ? match[1] : trimmed;
}

export function getFuzzy<T>(obj: Record<string, T>, term: string): T | undefined {
    let resolvedTerm = term;
    if (resolvedTerm.toUpperCase() === 'LEFT LEG' || resolvedTerm.toUpperCase() === 'RIGHT LEG') {
        resolvedTerm = 'Leg';
    }

    if (resolvedTerm.toUpperCase() === 'LEFT ARM' || resolvedTerm.toUpperCase() === 'RIGHT ARM') {
        resolvedTerm = 'Arm';
    }

    const direct = obj[resolvedTerm];
    if (direct !== undefined) return direct;
    for (const [name, entry] of Object.entries(obj)) {
        if (resolvedTerm.toUpperCase() === name.toUpperCase()) {
            return entry;
        }
    }
    return undefined;
}

export async function getCriticalDamage(type: string, location: string, amount: number): Promise<string | null> {
    const table = await loadCriticalDamageTable();
    const damageMap = getFuzzy(table, type);
    if (damageMap === undefined) return null;
    const locationMap = getFuzzy(damageMap, location);
    if (locationMap === undefined) return null;
    const clamped = amount > 10 ? 10 : amount;
    if (!Object.prototype.hasOwnProperty.call(locationMap, clamped)) return null;
    return locationMap[clamped] ?? null;
}
