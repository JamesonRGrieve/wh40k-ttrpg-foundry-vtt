/**
 * @file Weapon-quality mechanical payload index (#303).
 *
 * Replaces the hardcoded `WEAPON_QUALITY_EFFECTS` registry: the structured
 * payloads now live on the weaponQuality compendium documents (`system.mechanics`,
 * see `data/item/weapon-quality.ts`), and this module builds a by-identifier index
 * from that pack at `ready` so the resolvers in `weapon-quality-effects.ts` can read
 * a quality's mechanics without an in-`src/` content table (Direction #7).
 *
 * Docs store only the keys a quality sets; `weaponQualityMechanicsFromRaw` merges
 * each over the all-absent default so consumers always get a fully-shaped payload.
 */

import type { WeaponQualityMechanics } from '../data/item/weapon-quality-mechanics.ts';

/** Pack-name suffix shared by every system's weapon-qualities pack (`rt-core-items-weapon-qualities`, `dh2-…`, …). */
const WEAPON_QUALITY_PACK_SUFFIX = '-core-items-weapon-qualities';

/** All-absent payload: scalars `null`, flags `false`, strings `''`. */
function defaultWeaponQualityMechanics(): WeaponQualityMechanics {
    return {
        type: '',
        aimBonus: null,
        parryBonus: null,
        enemyParryPenalty: null,
        parryPenalty: null,
        attackBonus: null,
        rfThreshold: null,
        razorSharpDoubleOnDoS: null,
        haywireRadiusPerLevel: null,
        maximalPenetrationBonus: null,
        shockingAppliesFatigue: null,
        cannotParry: false,
        cannotBeParried: false,
        requiresPsyker: false,
        requiresEldar: false,
        bonusVsDaemons: false,
        ignoresNonWardedArmor: false,
        cancelsAim: false,
        provenFloor: false,
        bonusHitOnTwoDoS: false,
        doublesAdditionalHits: false,
        reliable: false,
        unreliable: false,
        ignoresDaemonResistance: false,
        powerFieldDestroysOnParry: false,
        overheats: false,
        recharge: false,
        triggersRecharge: false,
        primitiveCap: false,
        cripplingPenaltyPerActionVariable: false,
        gravitonAddsArmourAsDamage: false,
        allowsIndirectFire: false,
        indirectPenaltyVariable: false,
        shockingHalfDoFStun: false,
        corrosiveArmourDice: '',
        maximalDamageDice: '',
        toxicAdditionalDamageDice: '',
        sprayAvoidanceCharacteristic: '',
        hitEffect: { requiresSave: '', failEffect: '', stunRoundsVariable: false, stunRounds: null, saveTargetPenaltyPerLevel: null },
        template: { shape: '', radiusVariable: false },
        rangeBands: { pointBlank: null, shortRange: null, standardRange: null, longRange: null, extremeRange: null },
    };
}

/**
 * Merge a (possibly partial) raw `system.mechanics` payload over the all-absent
 * default, deep-merging the three nested sub-objects. Tolerates `null`/non-object
 * input (returns the default).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: raw is the untyped `system.mechanics` payload off a pack document, validated and merged over the default here
export function weaponQualityMechanicsFromRaw(raw: unknown): WeaponQualityMechanics {
    const base = defaultWeaponQualityMechanics();
    if (raw === null || typeof raw !== 'object') return base;
    const r = raw as Partial<WeaponQualityMechanics>;
    // Spreading a possibly-undefined/null nested object is a no-op, so the
    // deep-merge tolerates partial or absent sub-objects without a guard.
    return {
        ...base,
        ...r,
        hitEffect: { ...base.hitEffect, ...r.hitEffect },
        template: { ...base.template, ...r.template },
        rangeBands: { ...base.rangeBands, ...r.rangeBands },
    };
}

/* -------------------------------------------- */
/*  Index                                        */
/* -------------------------------------------- */

/**
 * Minimal Foundry-pack surface the index reads — the docs carry our WeaponQualityData
 * system shape. A canonical doc carries its own `mechanics` and a blank `mechanicsRef`;
 * a per-system stub leaves `mechanics` at the schema default and points `mechanicsRef`
 * at the canonical doc's UUID.
 */
interface WeaponQualityPackDoc {
    uuid?: string;
    system?: { identifier?: string; mechanics?: WeaponQualityMechanics; mechanicsRef?: string };
}
interface WeaponQualityPack {
    metadata?: { name?: string };
    getDocuments?: () => Promise<WeaponQualityPackDoc[]>;
}
interface PackGameLike {
    packs?: { filter?: (fn: (pack: WeaponQualityPack) => boolean) => WeaponQualityPack[] };
}

/** Per-system map (systemId → identifier → mechanics) plus a cross-system flat fallback. */
let payloadBySystem: Map<string, Map<string, WeaponQualityMechanics>> | null = null;
let payloadFlat: Map<string, WeaponQualityMechanics> | null = null;
/** Parallel per-system / flat maps of the definition's `hasLevel` flag (content off the pack doc). */
let hasLevelBySystem: Map<string, Map<string, boolean>> | null = null;
let hasLevelFlat: Map<string, boolean> | null = null;

/** Derive the system id from a weapon-qualities pack name (`rt-core-items-weapon-qualities` → `rt`). */
function systemIdFromPackName(name: string): string {
    return name.slice(0, -WEAPON_QUALITY_PACK_SUFFIX.length);
}

/**
 * Build the per-system payload index from every `*-core-items-weapon-qualities`
 * compendium. Call once on `ready`; idempotent (rebuilds the cache).
 *
 * Two passes: canonical docs (blank `mechanicsRef`) seed a `uuid → mechanics` table
 * and their own per-system entries; stub docs (`mechanicsRef` set) resolve their
 * mechanics by following the ref into that table, so the shared FFG RAW values stay
 * authored once on the Rogue Trader docs.
 */
export async function buildWeaponQualityPayloadIndex(): Promise<void> {
    const bySystem = new Map<string, Map<string, WeaponQualityMechanics>>();
    const flat = new Map<string, WeaponQualityMechanics>();
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const packs = packGame?.packs?.filter?.((pack) => pack.metadata?.name?.endsWith(WEAPON_QUALITY_PACK_SUFFIX) === true) ?? [];

    // Read every pack concurrently, then gather all docs up front so refs resolve
    // regardless of pack order (await lives in the map callback, not a loop).
    const sources: Array<{ systemId: string; getDocuments: () => Promise<WeaponQualityPackDoc[]> }> = [];
    for (const pack of packs) {
        const name = pack.metadata?.name;
        if (name === undefined || pack.getDocuments === undefined) continue;
        // Bind to the owning pack: `getDocuments` reads `this.documentClass`
        // internally, so a detached reference (called as `source.getDocuments()`)
        // would run with `this` = the plain `source` literal and throw
        // "Cannot read properties of undefined (reading 'database')".
        sources.push({ systemId: systemIdFromPackName(name), getDocuments: pack.getDocuments.bind(pack) });
    }
    const perPack = await Promise.all(sources.map(async (source) => ({ systemId: source.systemId, packDocs: await source.getDocuments() })));

    const docs: Array<{ systemId: string; doc: WeaponQualityPackDoc }> = [];
    const canonicalByUuid = new Map<string, WeaponQualityMechanics>();
    for (const { systemId, packDocs } of perPack) {
        for (const doc of packDocs) {
            docs.push({ systemId, doc });
            const ref = doc.system?.mechanicsRef;
            if ((ref === undefined || ref === '') && doc.uuid !== undefined) {
                canonicalByUuid.set(doc.uuid, weaponQualityMechanicsFromRaw(doc.system?.mechanics));
            }
        }
    }

    for (const { systemId, doc } of docs) {
        const identifier = doc.system?.identifier;
        if (typeof identifier !== 'string' || identifier === '') continue;
        const ref = doc.system?.mechanicsRef;
        const mechanics =
            ref !== undefined && ref !== ''
                ? canonicalByUuid.get(ref) ?? defaultWeaponQualityMechanics()
                : weaponQualityMechanicsFromRaw(doc.system?.mechanics);
        const key = identifier.toLowerCase();
        let systemMap = bySystem.get(systemId);
        if (systemMap === undefined) {
            systemMap = new Map<string, WeaponQualityMechanics>();
            bySystem.set(systemId, systemMap);
        }
        systemMap.set(key, mechanics);
        if (!flat.has(key)) flat.set(key, mechanics);
    }

    // hasLevel is modelled in the packs as a sibling `<id>-x` doc (blast + blast-x,
    // proven + proven-x, …), not the per-doc `hasLevel` flag (uniformly false); derive it.
    const levelBySystem = new Map<string, Map<string, boolean>>();
    for (const [systemId, systemMap] of bySystem) {
        const levels = new Map<string, boolean>();
        for (const key of systemMap.keys()) levels.set(key, systemMap.has(`${key}-x`));
        levelBySystem.set(systemId, levels);
    }
    const levelFlat = new Map<string, boolean>();
    for (const key of flat.keys()) levelFlat.set(key, flat.has(`${key}-x`));

    payloadBySystem = bySystem;
    payloadFlat = flat;
    hasLevelBySystem = levelBySystem;
    hasLevelFlat = levelFlat;
}

/**
 * Look up a quality's mechanics by identifier (case-insensitive), optionally scoped
 * to a game system. Falls back to the cross-system value when no system is given or
 * the system carries no entry (the FFG family's values are identical today). `null`
 * until the index is built.
 */
export function getWeaponQualityMechanics(identifier: string, systemId?: string): WeaponQualityMechanics | null {
    const key = identifier.toLowerCase();
    if (systemId !== undefined) {
        const scoped = payloadBySystem?.get(systemId)?.get(key);
        if (scoped !== undefined) return scoped;
    }
    return payloadFlat?.get(key) ?? null;
}

/** Seed the index directly (unit tests / stories — no Foundry pack available there). Populates the flat fallback. */
export function setWeaponQualityPayloadsForTesting(entries: Record<string, Partial<WeaponQualityMechanics>>): void {
    payloadBySystem = null;
    payloadFlat = new Map(Object.entries(entries).map(([id, partial]) => [id.toLowerCase(), weaponQualityMechanicsFromRaw(partial)]));
    hasLevelBySystem = null;
    hasLevelFlat = new Map();
}

/* -------------------------------------------- */
/*  Definition metadata (#303 — replaces the in-src WH40K.weaponQualities table) */
/* -------------------------------------------- */

/** Does the quality take an `(X)` level? Read from the pack doc via the index; `false` until built. */
export function getWeaponQualityHasLevel(identifier: string, systemId?: string): boolean {
    const key = identifier.toLowerCase();
    if (systemId !== undefined) {
        const scoped = hasLevelBySystem?.get(systemId)?.get(key);
        if (scoped !== undefined) return scoped;
    }
    return hasLevelFlat?.get(key) ?? false;
}

/** Pascal-case a quality identifier for langpack-key derivation (`razor-sharp` → `RazorSharp`, `unreliable-2` → `Unreliable2`). */
function pascalIdentifier(identifier: string): string {
    return identifier
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/** Langpack key for a quality's display label (`accurate` → `WH40K.WeaponQuality.Accurate`). */
export function weaponQualityLabelKey(identifier: string): string {
    return `WH40K.WeaponQuality.${pascalIdentifier(identifier)}`;
}

/** Langpack key for a quality's description (`accurate` → `WH40K.WeaponQuality.AccurateDesc`). */
export function weaponQualityDescKey(identifier: string): string {
    return `${weaponQualityLabelKey(identifier)}Desc`;
}
