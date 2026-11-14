/**
 * Fitting and removing weapon modifications personally (#136).
 *
 * In DH2 a character holding the parts fits a modification with a Trade
 * (Armourer) test modified by its Availability. Success fits it; failure loses
 * the parts, and two or more degrees of failure also damage the weapon, making
 * it Unreliable (or stripping Reliable). Removing a modification is a Tech-Use
 * test at the same modifier: success keeps the parts, failure loses them.
 *
 * The xenos step applies to modifying as well as repairing, so the line's rule
 * reuses the repair rule's `XenosRepairRules`.
 *
 * DH1, RT and OW use a plain Trade (Armourer) test with no modifier and no
 * failure consequence; DW and BC have no fitting test. The line's values live
 * on its game-system config
 * (`BaseSystemConfig.weaponModification`); this module holds only the
 * content-agnostic math.
 */

import { nonNegInt } from './_num.ts';
import { type AcquisitionLadder, availabilityTerm, normaliseAvailability } from './acquisition-ladder.ts';
import type { XenosRepairRules } from './xenos-equipment.ts';

/** A skill the line names for a modification test, optionally narrowed to one specialisation. */
export interface ModificationSkill {
    /** The actor skill key (`trade`, `techUse`). */
    readonly skill: string;
    /** The specialisation the book names (`Armourer`), or null for a standard skill. */
    readonly specialisation: string | null;
}

/** A line's printed personal-modification rule. */
export interface WeaponModificationRules {
    /** The skill that fits a modification. */
    readonly fitSkill: ModificationSkill;
    /** Whether the fitting / removal test takes the modification's Availability as its modifier. */
    readonly availabilityModifier: boolean;
    /** Whether a failed fitting loses the parts. */
    readonly partsLostOnFailure: boolean;
    /** A failed fitting by at least this many degrees damages the weapon; null where the book prints no damage. */
    readonly damagesWeaponAtDegreesOfFailure: number | null;
    /** The skill that removes a modification and recovers its parts, or null where the book prints no removal test. */
    readonly removalSkill: ModificationSkill | null;
    /** The line's xenos-equipment step (shared with repair), or null. */
    readonly xenos: XenosRepairRules | null;
    /**
     * The requisition bonus for taking a modification as parts to fit
     * personally, or null where the line has none. Buying the loose parts
     * eases the requisition test against the modification's Availability.
     */
    readonly partsRequisitionBonus: number | null;
}

/**
 * The modification test's Availability modifier: the line's printed
 * acquisition-ladder value for the modification's rating. Null when the line
 * takes no such modifier, or when the rating is unknown or printed without a
 * number ("Automatic" / "GM's discretion"); the GM then sets the difficulty.
 */
export function modificationAvailabilityModifier(
    rules: WeaponModificationRules,
    ladder: AcquisitionLadder | null,
    availability: string | null | undefined,
): number | null {
    if (!rules.availabilityModifier || ladder === null) return null;
    const key = normaliseAvailability(availability);
    if (key === null) return null;
    const term = availabilityTerm(ladder, key);
    return term.kind === 'modifier' ? term.value : null;
}

/** What a resolved fitting test does. */
interface FittingOutcome {
    /** The modification is attached to the weapon. */
    readonly fitted: boolean;
    /** The parts are used up: on a success they become the fitted modification, on a failure they are lost. */
    readonly partsConsumed: boolean;
    /** The weapon is damaged (Unreliable, or loses Reliable). */
    readonly weaponDamaged: boolean;
}

/** Resolve a fitting test against the line's rule. */
export function fittingOutcome(rules: WeaponModificationRules, success: boolean, degreesOfFailure: number): FittingOutcome {
    if (success) return { fitted: true, partsConsumed: true, weaponDamaged: false };
    const threshold = rules.damagesWeaponAtDegreesOfFailure;
    return {
        fitted: false,
        partsConsumed: rules.partsLostOnFailure,
        weaponDamaged: threshold !== null && nonNegInt(degreesOfFailure) >= threshold,
    };
}

/** The quality that a damaged weapon gains, or loses when it already has its opposite. */
const RELIABLE = 'reliable';
const UNRELIABLE = 'unreliable';

/**
 * A damaged weapon's base qualities: a Reliable weapon loses Reliable;
 * anything else becomes Unreliable. Craftsmanship-derived reliability is
 * applied on top of the base list, so a Good-craftsmanship weapon gaining
 * Unreliable nets out to losing its derived Reliable.
 */
export function damagedWeaponQualities(special: Iterable<string>): string[] {
    const qualities = new Set(special);
    if (qualities.has(RELIABLE)) qualities.delete(RELIABLE);
    else qualities.add(UNRELIABLE);
    return [...qualities];
}

/** A modification's rate-of-fire deltas: semi / full add to a mode the weapon has; single > 0 gives single shot, < 0 takes it away. */
export interface ModificationRateOfFire {
    single: number;
    semi: number;
    full: number;
}

/** The modifier block a fitted modification caches on the weapon (#740: clip, range multiplier and rate of fire too). */
export interface CachedModificationModifiers {
    damage: number;
    penetration: number;
    toHit: number;
    range: number;
    weight: number;
    clip: number;
    rangeMultiplier: number;
    rateOfFire: ModificationRateOfFire;
}

/** The modifier block of a modification document, as authored (every field optional). */
export type ModificationModifiersSource = Partial<Omit<CachedModificationModifiers, 'rateOfFire'>> & {
    rateOfFire?: Partial<ModificationRateOfFire> | undefined;
};

/** The cached block for an authored one: absent fields take their neutral value. */
export function cacheModificationModifiers(mods: ModificationModifiersSource | undefined): CachedModificationModifiers {
    return {
        damage: mods?.damage ?? 0,
        penetration: mods?.penetration ?? 0,
        toHit: mods?.toHit ?? 0,
        range: mods?.range ?? 0,
        weight: mods?.weight ?? 0,
        clip: mods?.clip ?? 0,
        rangeMultiplier: mods?.rangeMultiplier ?? 1,
        rateOfFire: { single: mods?.rateOfFire?.single ?? 0, semi: mods?.rateOfFire?.semi ?? 0, full: mods?.rateOfFire?.full ?? 0 },
    };
}

/**
 * The summed modifiers of a weapon's active modifications. Deltas add, range
 * multipliers multiply. `live` returns a fitted modification's current authored
 * block when its document is loaded, so an edit made after fitting applies; the
 * cache fitted with it answers otherwise (a compendium source).
 */
export function sumModificationModifiers(
    entries: readonly { readonly uuid: string; readonly active: boolean; readonly cachedModifiers: ModificationModifiersSource }[],
    live: (uuid: string) => ModificationModifiersSource | null = () => null,
): CachedModificationModifiers {
    const total = cacheModificationModifiers(undefined);
    for (const entry of entries) {
        if (!entry.active) continue;
        const mods = cacheModificationModifiers(live(entry.uuid) ?? entry.cachedModifiers);
        total.damage += mods.damage;
        total.penetration += mods.penetration;
        total.toHit += mods.toHit;
        total.range += mods.range;
        total.weight += mods.weight;
        total.clip += mods.clip;
        total.rangeMultiplier *= mods.rangeMultiplier;
        total.rateOfFire.single += mods.rateOfFire.single;
        total.rateOfFire.semi += mods.rateOfFire.semi;
        total.rateOfFire.full += mods.rateOfFire.full;
    }
    return total;
}

/** One line of a fitted modification's effects: its langpack key and the `{value}` it formats. */
export interface ModificationEffectLine {
    readonly key: string;
    readonly value: string;
}

/** The effects a modification block has, in sheet order; a neutral field has no line. */
export function modificationEffectLines(source: ModificationModifiersSource): ModificationEffectLine[] {
    const m = cacheModificationModifiers(source);
    const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;
    const lines: ModificationEffectLine[] = [];
    const delta = (key: string, value: number): void => {
        if (value !== 0) lines.push({ key, value: signed(value) });
    };
    delta('WH40K.WeaponSheet.EffectDamage', m.damage);
    delta('WH40K.WeaponSheet.EffectPenetration', m.penetration);
    delta('WH40K.WeaponSheet.EffectToHit', m.toHit);
    delta('WH40K.WeaponSheet.EffectRange', m.range);
    if (m.rangeMultiplier !== 1) lines.push({ key: 'WH40K.WeaponSheet.EffectRangeMultiplier', value: String(m.rangeMultiplier) });
    delta('WH40K.WeaponSheet.EffectClip', m.clip);
    if (m.rateOfFire.single > 0) lines.push({ key: 'WH40K.WeaponSheet.EffectSingleShotGained', value: '' });
    if (m.rateOfFire.single < 0) lines.push({ key: 'WH40K.WeaponSheet.EffectSingleShotLost', value: '' });
    delta('WH40K.WeaponSheet.EffectRateOfFireSemi', m.rateOfFire.semi);
    delta('WH40K.WeaponSheet.EffectRateOfFireFull', m.rateOfFire.full);
    delta('WH40K.WeaponSheet.EffectWeight', m.weight);
    return lines;
}

/** A range with its modifications applied: the deltas, then the multipliers, rounded down and never below 0. */
export function modifiedRange(base: number, mods: Pick<CachedModificationModifiers, 'range' | 'rangeMultiplier'>): number {
    return Math.max(0, Math.floor((base + mods.range) * mods.rangeMultiplier));
}

/** A weapon's rate of fire with its modifications' deltas: a semi / full mode it has grows or shrinks (never below 1), single shot is given or taken. */
export function modifiedRateOfFire(
    rof: { readonly single: boolean; readonly semi: number; readonly full: number },
    mods: ModificationRateOfFire,
): { single: boolean; semi: number; full: number } {
    const step = (value: number, delta: number): number => (value > 0 ? Math.max(1, value + delta) : value);
    return { single: mods.single > 0 ? true : mods.single < 0 ? false : rof.single, semi: step(rof.semi, mods.semi), full: step(rof.full, mods.full) };
}

/** One entry of `WeaponData.modifications`. */
export interface WeaponModificationEntry {
    uuid: string;
    name: string;
    active: boolean;
    category: string;
    cachedModifiers: CachedModificationModifiers;
}

/** The weaponModification surface the attach path reads. */
export interface ModificationSource {
    readonly uuid: string;
    readonly name: string;
    readonly system: {
        readonly category: string;
        readonly modifiers?: ModificationModifiersSource | undefined;
        readonly restrictions?:
            | { readonly weaponClasses?: ReadonlySet<string> | undefined; readonly weaponTypes?: ReadonlySet<string> | undefined }
            | undefined;
    };
}

/** The weapon surface the attach path reads. */
export interface ModifiableWeaponSystem {
    readonly class: string;
    readonly type: string;
    readonly modifications: readonly { readonly uuid: string }[];
}

/** Why a modification cannot go on a weapon. */
type ModificationBlocker = 'weaponClass' | 'weaponType' | 'alreadyInstalled';

/** The langpack message for each blocker; each takes `{name, classLabel, typeLabel}`. */
export const MODIFICATION_BLOCKER_KEYS: Readonly<Record<ModificationBlocker, string>> = {
    weaponClass: 'WH40K.WeaponSheet.ModificationClassIncompatible',
    weaponType: 'WH40K.WeaponSheet.ModificationTypeIncompatible',
    alreadyInstalled: 'WH40K.WeaponSheet.ModificationAlreadyInstalled',
};

/** The document fields {@link partsSourceUuid} reads. */
interface PartsDocument {
    readonly uuid: string;
    readonly _stats?: { readonly compendiumSource?: string | null | undefined } | undefined;
}

/**
 * The document a personally fitted modification points back to: the parts'
 * compendium source, because the parts item itself is used up by the fitting.
 * Parts created from scratch in the world fall back to their own uuid.
 */
export function partsSourceUuid(parts: PartsDocument): string {
    const source = parts._stats?.compendiumSource;
    return typeof source === 'string' && source !== '' ? source : parts.uuid;
}

/** Whether `mod` fits `weapon`: its class / type restrictions, and no second copy. Null when it fits. */
export function modificationBlocker(weapon: ModifiableWeaponSystem, mod: ModificationSource, sourceUuid: string = mod.uuid): ModificationBlocker | null {
    const classes = mod.system.restrictions?.weaponClasses;
    if (classes !== undefined && classes.size > 0 && !classes.has(weapon.class)) return 'weaponClass';
    const types = mod.system.restrictions?.weaponTypes;
    if (types !== undefined && types.size > 0 && !types.has(weapon.type)) return 'weaponType';
    if (weapon.modifications.some((entry) => entry.uuid === sourceUuid)) return 'alreadyInstalled';
    return null;
}

/**
 * The entry a modification adds to `WeaponData.modifications`. `sourceUuid`
 * is the document the entry points back to; a personally fitted modification
 * points at the parts' compendium source, because the parts item itself is
 * used up.
 */
export function modificationEntry(mod: ModificationSource, sourceUuid: string = mod.uuid): WeaponModificationEntry {
    const mods = mod.system.modifiers;
    return {
        uuid: sourceUuid,
        name: mod.name,
        active: true,
        category: mod.system.category !== '' ? mod.system.category : 'accessory',
        cachedModifiers: cacheModificationModifiers(mods),
    };
}
