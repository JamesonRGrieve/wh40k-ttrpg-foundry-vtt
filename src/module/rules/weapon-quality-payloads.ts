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

const WEAPON_QUALITY_PACK = 'wh40k-rpg.rt-core-items-weapon-qualities';

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
/*  Index                                       */
/* -------------------------------------------- */

/** Minimal Foundry-pack surface the index reads — the docs carry our WeaponQualityData system shape. */
interface WeaponQualityPackDoc {
    system?: { identifier?: string; mechanics?: WeaponQualityMechanics };
}
interface WeaponQualityPack {
    getDocuments?: () => Promise<WeaponQualityPackDoc[]>;
}
interface PackGameLike {
    packs?: { get?: (id: string) => WeaponQualityPack | undefined };
}

let payloadIndex: Map<string, WeaponQualityMechanics> | null = null;

/**
 * Build the by-identifier payload index from the weaponQuality compendium. Call
 * once on `ready`; idempotent (rebuilds the cache).
 */
export async function buildWeaponQualityPayloadIndex(): Promise<void> {
    const map = new Map<string, WeaponQualityMechanics>();
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const pack = packGame?.packs?.get?.(WEAPON_QUALITY_PACK);
    if (pack?.getDocuments !== undefined) {
        const docs = await pack.getDocuments();
        for (const doc of docs) {
            const identifier = doc.system?.identifier;
            if (typeof identifier === 'string' && identifier !== '') {
                map.set(identifier.toLowerCase(), weaponQualityMechanicsFromRaw(doc.system?.mechanics));
            }
        }
    }
    payloadIndex = map;
}

/** Look up a quality's mechanics by identifier (case-insensitive). `null` until the index is built. */
export function getWeaponQualityMechanics(identifier: string): WeaponQualityMechanics | null {
    return payloadIndex?.get(identifier.toLowerCase()) ?? null;
}

/** Seed the index directly (unit tests only — no Foundry pack available there). */
export function setWeaponQualityPayloadsForTesting(entries: Record<string, Partial<WeaponQualityMechanics>>): void {
    payloadIndex = new Map(Object.entries(entries).map(([id, partial]) => [id.toLowerCase(), weaponQualityMechanicsFromRaw(partial)]));
}
