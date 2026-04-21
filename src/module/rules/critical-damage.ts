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

let CACHED_TABLE: CriticalDamageTable | null = null;
let CACHED_PACK_ID: string | null = null;

/**
 * Build the damageType × bodyPart × severity lookup from the
 * `criticalInjury` items in the compendium pack. Text for every result lives
 * in the private packs submodule (GW-copyrighted); if the pack isn't
 * installed, the returned table is empty and callers should degrade to a
 * minimal fallback string.
 */
export async function loadCriticalDamageTable(): Promise<CriticalDamageTable> {
    if (CACHED_TABLE && CACHED_PACK_ID === CRITICAL_INJURY_PACK) return CACHED_TABLE;
    const pack = (globalThis as any).game?.packs?.get?.(CRITICAL_INJURY_PACK);
    if (!pack) {
        CACHED_TABLE = {};
        CACHED_PACK_ID = CRITICAL_INJURY_PACK;
        return CACHED_TABLE;
    }
    const docs = (await pack.getDocuments()) as ConsolidatedCriticalInjuryItem[];
    const table: CriticalDamageTable = {};
    for (const doc of docs) {
        const dt = normalizeKey(doc.system?.damageType);
        const bp = normalizeKey(doc.system?.bodyPart);
        if (!dt || !bp) continue;
        table[dt] ??= {};
        table[dt][bp] ??= {};
        const effects = doc.system?.effects ?? {};
        for (const [severityStr, effect] of Object.entries(effects)) {
            const severity = Number.parseInt(severityStr, 10);
            if (!Number.isFinite(severity)) continue;
            const raw = effect?.text ?? '';
            table[dt][bp][severity] = stripOuterParagraph(raw);
        }
    }
    CACHED_TABLE = table;
    CACHED_PACK_ID = CRITICAL_INJURY_PACK;
    return table;
}

/** Discard the cached lookup — call after editing pack items at runtime. */
export function invalidateCriticalDamageCache(): void {
    CACHED_TABLE = null;
    CACHED_PACK_ID = null;
}

function normalizeKey(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function stripOuterParagraph(html: string): string {
    const trimmed = html.trim();
    const match = /^<p>([\s\S]*?)<\/p>$/.exec(trimmed);
    return match ? match[1] : trimmed;
}

export function getFuzzy(obj: Record<string, unknown>, term: string): unknown {
    let resolvedTerm = term;
    if (resolvedTerm.toUpperCase() === 'LEFT LEG' || resolvedTerm.toUpperCase() === 'RIGHT LEG') {
        resolvedTerm = 'Leg';
    }

    if (resolvedTerm.toUpperCase() === 'LEFT ARM' || resolvedTerm.toUpperCase() === 'RIGHT ARM') {
        resolvedTerm = 'Arm';
    }

    if (obj[resolvedTerm]) return obj[resolvedTerm];
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
    if (!damageMap) return null;
    const locationMap = getFuzzy(damageMap as Record<string, unknown>, location);
    if (!locationMap) return null;
    const clamped = amount > 10 ? 10 : amount;
    const text = (locationMap as Record<number, string>)[clamped];
    return text ?? null;
}
