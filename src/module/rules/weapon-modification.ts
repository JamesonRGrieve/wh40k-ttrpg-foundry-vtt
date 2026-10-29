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

/** The modifier block a fitted modification caches on the weapon. */
interface CachedModificationModifiers {
    damage: number;
    penetration: number;
    toHit: number;
    range: number;
    weight: number;
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
        readonly modifiers?: Partial<CachedModificationModifiers> | undefined;
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
        cachedModifiers: {
            damage: mods?.damage ?? 0,
            penetration: mods?.penetration ?? 0,
            toHit: mods?.toHit ?? 0,
            range: mods?.range ?? 0,
            weight: mods?.weight ?? 0,
        },
    };
}
