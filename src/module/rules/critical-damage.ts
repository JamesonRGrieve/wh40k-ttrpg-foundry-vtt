import { type CanonicalBodyPart, type CanonicalDamageType, normalizeBodyPart, normalizeDamageType } from './damage-type.ts';

export interface CriticalDamageTable {
    [key: string]: {
        [key: string]: {
            [key: number]: string;
        };
    };
}

/**
 * Content-agnostic classification of the conditions / special damage a
 * Critical Effects row inflicts (core.md §"Conditions And Special
 * Damage"). These flags are derived by scanning the row text for the
 * system's own condition vocabulary — they are NOT a hand-maintained
 * content table (the prose text itself stays in the GW-copyrighted
 * compendium pack per Direction #7). The damage-application path reads
 * these flags to know which ActiveEffects / conditions to apply.
 */
export interface CriticalDamageRiders {
    /** Row applies the Stunned condition. */
    readonly stunned: boolean;
    /** Row sets the target on fire (Burning) or risks catching fire. */
    readonly burning: boolean;
    /** Row inflicts Blood Loss. */
    readonly bloodLoss: boolean;
    /** Row knocks the target Prone. */
    readonly prone: boolean;
    /** Row Blinds the target. */
    readonly blinded: boolean;
    /** Row Deafens the target. */
    readonly deafened: boolean;
    /** Row inflicts at least one level of Fatigue. */
    readonly fatigue: boolean;
    /** Row severs or renders Useless a limb (Lost Hand/Arm/Foot/Leg/Eye). */
    readonly lostLimb: boolean;
    /** Row is outright lethal (the target dies / does not survive). */
    readonly fatal: boolean;
}

/** Structured Critical Damage lookup result. */
export interface CriticalDamageRecord {
    /** Canonical damage type the effect was resolved on. */
    readonly damageType: CanonicalDamageType;
    /** Canonical body-part the effect was resolved on. */
    readonly bodyPart: CanonicalBodyPart;
    /** The Critical-damage severity row (1–10; 10 = the 10+ row). */
    readonly severity: number;
    /** Narrative effect text (from the compendium; '' if pack absent). */
    readonly effect: string;
    /** Which conditions / special damage this row inflicts. */
    readonly riders: CriticalDamageRiders;
}

/** Empty rider set — used when no effect text is available to classify. */
const NO_RIDERS: CriticalDamageRiders = Object.freeze({
    stunned: false,
    burning: false,
    bloodLoss: false,
    prone: false,
    blinded: false,
    deafened: false,
    fatigue: false,
    lostLimb: false,
    fatal: false,
});

/**
 * Classify a Critical Effects row's prose into structured rider flags.
 * Pure keyword scan over the system's condition vocabulary — content-
 * agnostic primitive logic, identical in spirit to `stripOuterParagraph`.
 */
export function classifyCriticalEffect(effectText: string | null | undefined): CriticalDamageRiders {
    if (typeof effectText !== 'string' || effectText.trim() === '') return NO_RIDERS;
    const t = effectText.toLowerCase();
    return Object.freeze({
        stunned: t.includes('stunned'),
        burning: t.includes('catch fire') || t.includes('catches fire') || t.includes('on fire') || t.includes('immolate') || t.includes('burning'),
        bloodLoss: t.includes('blood loss'),
        prone: t.includes('prone'),
        blinded: t.includes('blinded') || t.includes('lost eye') || t.includes('loses an eye') || t.includes('scooping out the eye'),
        deafened: t.includes('deafened'),
        fatigue: t.includes('fatigue'),
        lostLimb:
            t.includes('lost hand') ||
            t.includes('lost arm') ||
            t.includes('lost foot') ||
            t.includes('lost leg') ||
            t.includes('lost eye') ||
            t.includes('useless') ||
            t.includes('severed') ||
            t.includes('amputat'),
        fatal:
            t.includes('immediately dies') ||
            t.includes('he immediately dies') ||
            t.includes('dies instantly') ||
            t.includes('killed instantly') ||
            t.includes('killed the target') ||
            t.includes('killing the target') ||
            t.includes('killing him instantly') ||
            t.includes('instantly fatal') ||
            t.includes('instantly slain') ||
            t.includes('instantly killing') ||
            t.includes('messily fatal') ||
            t.includes('is killed instantly') ||
            t.includes('does not survive') ||
            t.includes('does not get up') ||
            t.includes('quite dead') ||
            t.includes('very, very dead') ||
            t.includes('deader than this') ||
            t.includes('is dead before') ||
            t.includes('dies in a') ||
            t.includes('dies from shock') ||
            t.includes('dies a horrible') ||
            t.includes('death is instantaneous') ||
            t.includes('death is instantane') ||
            t.includes('a lifeless corpse') ||
            t.includes('lifeless form') ||
            t.includes('crumpling to\nthe ground dead') ||
            t.includes('to the ground dead') ||
            t.includes('the ground dead') ||
            t.includes('before dying') ||
            t.includes('he does not survive') ||
            t.includes('ceases to exist'),
    });
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

    // Use Maps for construction to avoid noUncheckedIndexedAccess warnings on intermediate writes
    const dtMap = new Map<string, Map<string, Map<number, string>>>();
    for (const doc of docs) {
        const dt = normalizeKey(doc.system?.damageType);
        const bp = normalizeKey(doc.system?.bodyPart);
        if (dt === null || bp === null) continue;
        if (!dtMap.has(dt)) dtMap.set(dt, new Map());
        const bpMap = dtMap.get(dt) as Map<string, Map<number, string>>;
        if (!bpMap.has(bp)) bpMap.set(bp, new Map());
        const sMap = bpMap.get(bp) as Map<number, string>;
        const effects = doc.system?.effects ?? {};
        for (const [severityStr, effect] of Object.entries(effects)) {
            const severity = Number.parseInt(severityStr, 10);
            if (!Number.isFinite(severity)) continue;
            const raw = effect.text ?? '';
            sMap.set(severity, stripOuterParagraph(raw));
        }
    }

    return Object.fromEntries(
        [...dtMap.entries()].map(([dt, bpMap]) => [dt, Object.fromEntries([...bpMap.entries()].map(([bp, sMap]) => [bp, Object.fromEntries(sMap)]))]),
    );
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
    return match?.[1] ?? trimmed;
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
    if (!Object.hasOwn(locationMap, clamped)) return null;
    return locationMap[clamped] ?? null;
}

/**
 * Clamp a raw Critical-damage total to a table row (1 … 10, where 10 is
 * the "10+" row). Values below 1 clamp up to 1 — any Critical damage at
 * all triggers at least the row-1 effect (core.md L10650).
 */
export function clampCriticalSeverity(amount: number): number {
    const n = Number.isFinite(amount) ? Math.trunc(amount) : 1;
    if (n < 1) return 1;
    if (n > 10) return 10;
    return n;
}

/**
 * Pure structured Critical Damage lookup:
 *   (damageType, hitLocation, criticalValue) → CriticalDamageRecord
 *
 * Resolves the GW-copyrighted effect prose from the compendium pack
 * (via `getCriticalDamage`) and layers the content-agnostic rider
 * classification on top so the damage-application path knows which
 * ActiveEffects / conditions (Stunned, Burning, Blood Loss, Helpless,
 * lost limb, …) to apply. The hit location is collapsed onto its
 * Critical Effects body-part; an unknown damage type falls back to
 * Impact per core.md L10646.
 *
 * Returns null only when the damage type / body-part cannot be
 * resolved at all. When the compendium pack is absent the record is
 * still returned with `effect: ''` and empty riders, so the chat card
 * and conditions plumbing degrade gracefully.
 */
export async function getCriticalDamageRecord(
    damageType: string | null | undefined,
    hitLocation: string | null | undefined,
    criticalValue: number,
): Promise<CriticalDamageRecord | null> {
    // core.md L10646: an unspecified / unknown damage type is Impact.
    const dt = normalizeDamageType(damageType) ?? 'Impact';
    const bp = normalizeBodyPart(hitLocation);
    if (bp === null) return null;
    const severity = clampCriticalSeverity(criticalValue);
    const effect = (await getCriticalDamage(dt, bp, severity)) ?? '';
    return {
        damageType: dt,
        bodyPart: bp,
        severity,
        effect,
        riders: classifyCriticalEffect(effect),
    };
}
