import { type CanonicalBodyPart, type CanonicalDamageType, normalizeBodyPart, normalizeDamageType } from './damage-type.ts';

/**
 * How a Critical Effects row's outcome is gated on armour worn at the struck
 * location (core.md §"Critical Effects" decision-tree rows). Content-agnostic —
 * derived from the row prose, not a hand-maintained per-row table.
 *
 * - `none`               — the row applies unconditionally.
 * - `negates`            — worn armour at the location negates the row entirely
 *                          ("If he is wearing a helmet, he suffers no ill
 *                          effects"; "If he is wearing armour, there is no
 *                          effect"). The applier skips the row when armoured.
 * - `worsensIfUnarmoured` — an *unarmoured* location suffers extra harm the
 *                          armoured one avoids ("If he is not wearing a helmet,
 *                          the target instead loses an ear …"). The applier
 *                          applies the row's conditions when unarmoured and, when
 *                          armoured, surfaces the reduction for GM adjudication
 *                          rather than auto-applying the harsher branch.
 */
type CriticalArmourGate = 'none' | 'negates' | 'worsensIfUnarmoured';

interface CriticalDamageTable {
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
    /**
     * Row knocks/tears the target's helmet off ("If he is wearing a helmet, it
     * is torn off"). The damage-application path unequips the target's equipped
     * head-covering armour when this is set and one is worn.
     */
    readonly helmetTornOff: boolean;
    /**
     * How the row is gated on armour worn at the struck location — a decision
     * tree ("If he is wearing a helmet/armour, he suffers no ill effects"; "If he
     * is not wearing armour, he suffers …"). See {@link CriticalArmourGate}. The
     * applier resolves the gate against the target's armour at the crit body-part
     * (a helmet for Head hits, location armour otherwise).
     */
    readonly armourGate: CriticalArmourGate;
    /**
     * Row makes the target drop what it is holding ("Drop any item held in the
     * hand", "drops anything he was holding") — a hand/arm crit. The applier
     * unequips the target's held (equipped) weapon.
     */
    readonly dropsHeldItem: boolean;
    /**
     * Row destroys / renders useless what the target is holding ("anything he was
     * carrying in that hand is destroyed", "badly damaged and unusable until
     * repaired"). The applier marks the held weapon broken (reversible via a
     * Tech-Use Repair) and unequips it. Supersedes {@link dropsHeldItem} on the
     * same weapon.
     */
    readonly weaponDestroyed: boolean;
    /**
     * Row detonates the target's carried munitions ("If the target is carrying
     * any ammunition, it explodes"; "any grenades or missiles … detonate
     * immediately"). The applier finds carried grenades/ammunition, rolls each
     * detonating grenade's own damage, and surfaces the secondary hits for the
     * GM to distribute (blast radius / nearby targets need token positions the
     * damage path does not have).
     */
    readonly detonatesMunitions: boolean;
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
    helmetTornOff: false,
    armourGate: 'none',
    dropsHeldItem: false,
    weaponDestroyed: false,
    detonatesMunitions: false,
});

const BURNING_KEYWORDS = ['catch fire', 'catches fire', 'on fire', 'immolate', 'burning'] as const;
const BLINDED_KEYWORDS = ['blinded', 'lost eye', 'loses an eye', 'scooping out the eye'] as const;
const LOST_LIMB_KEYWORDS = ['lost hand', 'lost arm', 'lost foot', 'lost leg', 'lost eye', 'useless', 'severed', 'amputat'] as const;
const FATAL_KEYWORDS = [
    'immediately dies',
    'he immediately dies',
    'dies instantly',
    'killed instantly',
    'killed the target',
    'killing the target',
    'killing him instantly',
    'instantly fatal',
    'instantly slain',
    'instantly killing',
    'messily fatal',
    'is killed instantly',
    'does not survive',
    'does not get up',
    'quite dead',
    'very, very dead',
    'deader than this',
    'is dead before',
    'dies in a',
    'dies from shock',
    'dies a horrible',
    'death is instantaneous',
    'death is instantane',
    'a lifeless corpse',
    'lifeless form',
    'crumpling to\nthe ground dead',
    'to the ground dead',
    'the ground dead',
    'before dying',
    'he does not survive',
    'ceases to exist',
] as const;

/** A worn helmet is knocked/torn/blown off. Requires the word "helmet" to co-occur. */
const HELMET_OFF_KEYWORDS = [
    'torn off',
    'knocked off',
    'knocks off',
    'torn from',
    'blown off',
    'ripped off',
    'knocked from',
    'from his head',
    'from her head',
    'from their head',
] as const;
/** The row negates its ill effect when the location is armoured ("wearing a helmet, he suffers no ill effects"). */
const ARMOUR_NEGATE_KEYWORDS = ['no ill effect', 'no effect', 'suffers no', 'is protected', 'protects him', 'thanks the emperor'] as const;
/** The row worsens for an unarmoured location ("if he is not wearing a helmet, …"). */
const UNARMOURED_KEYWORDS = ['not wearing', 'no helmet', 'without a helmet', 'has no armour', 'unarmoured'] as const;
/** The target drops what it is holding (a hand/arm crit). The applier unequips the held weapon. */
const DROP_HELD_KEYWORDS = [
    'drop any item held',
    'drop held item',
    'drop anything held',
    'drops anything held',
    'drops anything he was holding',
    'drops anything they were holding',
    'drops whatever',
    'drop whatever',
    'drops his weapon',
    'drop his weapon',
    'item held in the hand',
    'item held in that hand',
    'releases anything he was holding',
] as const;
/** The held item is destroyed / rendered unusable (stronger than a mere drop). */
const WEAPON_DESTROYED_KEYWORDS = [
    'is destroyed',
    'are destroyed',
    'was destroyed',
    'badly damaged and unusable',
    'unusable until repaired',
    'damaged and unusable',
] as const;
/** Carried munitions cook off — needs a munition noun AND a detonation verb (below) to co-occur. */
const MUNITION_NOUN_KEYWORDS = ['ammunition', 'ammo', 'grenade', 'missile'] as const;
const DETONATION_VERB_KEYWORDS = ['detonate', 'explode'] as const;

const anyKeyword = (haystack: string, needles: readonly string[]): boolean => needles.some((n) => haystack.includes(n));

/**
 * Derive the {@link CriticalArmourGate} for a row from its prose. A row that
 * mentions a helmet/armour and states a no-effect outcome is `negates` (worn
 * armour cancels it); a row that only mentions being *un*armoured worsening is
 * `worsensIfUnarmoured`; otherwise `none`. Pure keyword co-occurrence — no
 * per-row content table.
 */
function classifyArmourGate(t: string): CriticalArmourGate {
    const mentionsArmour = t.includes('helmet') || t.includes('armour');
    if (!mentionsArmour) return 'none';
    // "…no effect / no ill effect / suffers no…" alongside an armour mention →
    // worn armour negates the row (covers both "if wearing … no effect" and
    // "if not wearing … he suffers …; if wearing … there is no effect").
    if (anyKeyword(t, ARMOUR_NEGATE_KEYWORDS)) return 'negates';
    // No negation clause, but an unarmoured location is called out as worse.
    if (anyKeyword(t, UNARMOURED_KEYWORDS)) return 'worsensIfUnarmoured';
    return 'none';
}

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
        burning: anyKeyword(t, BURNING_KEYWORDS),
        bloodLoss: t.includes('blood loss'),
        prone: t.includes('prone'),
        blinded: anyKeyword(t, BLINDED_KEYWORDS),
        deafened: t.includes('deafened'),
        fatigue: t.includes('fatigue'),
        lostLimb: anyKeyword(t, LOST_LIMB_KEYWORDS),
        fatal: anyKeyword(t, FATAL_KEYWORDS),
        helmetTornOff: t.includes('helmet') && anyKeyword(t, HELMET_OFF_KEYWORDS),
        armourGate: classifyArmourGate(t),
        dropsHeldItem: anyKeyword(t, DROP_HELD_KEYWORDS),
        weaponDestroyed: anyKeyword(t, WEAPON_DESTROYED_KEYWORDS),
        detonatesMunitions: anyKeyword(t, MUNITION_NOUN_KEYWORDS) && anyKeyword(t, DETONATION_VERB_KEYWORDS),
    });
}

/** The line whose critical-injury pack is used when a system has no crit pack of its own. */
const DEFAULT_CRIT_SYSTEM = 'dh2';

/**
 * Resolve the critical-injury compendium for a game line (#439) — the line's own
 * `<system>-core-items-critical-injuries` pack where it exists, else the DH2 pack
 * (lines that share the DH2 critical table). Keeps the applied-damage descriptor
 * lookup homologated: RT/IM read their own crit tables, not DH2's.
 */
function criticalInjuryPackId(systemId: string): string {
    const perLine = `wh40k-rpg.${systemId}-core-items-critical-injuries`;
    return game.packs.get(perLine) !== undefined ? perLine : `wh40k-rpg.${DEFAULT_CRIT_SYSTEM}-core-items-critical-injuries`;
}

type ConsolidatedEffect = { text?: string | null; permanent?: boolean };
type ConsolidatedCriticalInjuryItem = {
    system?: {
        damageType?: string;
        bodyPart?: string;
        effects?: Record<string, ConsolidatedEffect>;
    };
};

/** Per-system critical-damage table cache, keyed by the resolved game-line id. */
const CACHED_TABLES = new Map<string, Promise<CriticalDamageTable>>();

/**
 * Build the damageType × bodyPart × severity lookup from the
 * `criticalInjury` items in the compendium pack. Text for every result lives
 * in the private packs submodule (GW-copyrighted); if the pack isn't
 * installed, the returned table is empty and callers should degrade to a
 * minimal fallback string.
 */
async function loadCriticalDamageTable(systemId: string): Promise<CriticalDamageTable> {
    const existing = CACHED_TABLES.get(systemId);
    if (existing !== undefined) return existing;
    const promise = buildCriticalDamageTable(systemId);
    CACHED_TABLES.set(systemId, promise);
    try {
        return await promise;
    } catch (err) {
        CACHED_TABLES.delete(systemId);
        throw err;
    }
}

async function buildCriticalDamageTable(systemId: string): Promise<CriticalDamageTable> {
    const pack = game.packs.get(criticalInjuryPackId(systemId));
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
    CACHED_TABLES.clear();
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

function getFuzzy<T>(obj: Record<string, T>, term: string): T | undefined {
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

export async function getCriticalDamage(type: string, location: string, amount: number, systemId: string = DEFAULT_CRIT_SYSTEM): Promise<string | null> {
    const table = await loadCriticalDamageTable(systemId);
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
    systemId: string = DEFAULT_CRIT_SYSTEM,
): Promise<CriticalDamageRecord | null> {
    // core.md L10646: an unspecified / unknown damage type is Impact.
    const dt = normalizeDamageType(damageType) ?? 'Impact';
    const bp = normalizeBodyPart(hitLocation);
    if (bp === null) return null;
    const severity = clampCriticalSeverity(criticalValue);
    const effect = (await getCriticalDamage(dt, bp, severity, systemId)) ?? '';
    return {
        damageType: dt,
        bodyPart: bp,
        severity,
        effect,
        riders: classifyCriticalEffect(effect),
    };
}

/**
 * Map the content-agnostic Critical Effects riders to the condition-registry
 * ids applied by `active-effects.ts` `createConditionEffect` (#108). Pure and
 * ordered. The returned ids are keys of the shared condition registry, so any
 * system that shares that registry gets the same effect application.
 *
 * `fatal` now maps to the registry's `dead` status (#495). Death used to be the
 * one outcome with no state at all — only chat prose — so nothing downstream
 * (the token defeated overlay, the combat tracker, the #477 pile conversion)
 * could see that the creature had died. The status IS the state; the GM can
 * clear it like any other condition if they overrule the result.
 * @param {CriticalDamageRiders} riders  Riders classified from the crit row.
 * @returns {string[]}  Condition-registry ids to apply.
 */
export function criticalRiderConditionIds(riders: CriticalDamageRiders): string[] {
    const ids: string[] = [];
    if (riders.fatal) ids.push('dead');
    if (riders.stunned) ids.push('stunned');
    if (riders.burning) ids.push('burning');
    if (riders.bloodLoss) ids.push('bloodloss');
    if (riders.prone) ids.push('prone');
    if (riders.blinded) ids.push('blinded');
    if (riders.deafened) ids.push('deafened');
    if (riders.fatigue) ids.push('fatigued');
    if (riders.lostLimb) ids.push('uselessLimb');
    return ids;
}
