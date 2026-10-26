/**
 * @file A grenade's rider (#135): the save-or-suffer payload a grenade carries in
 * place of, or beside, its damage — a Photon Flash's blinding, a Psychotroke's
 * hallucinogen step-up, Tears of the Emperor against psykers and daemons, a Smoke
 * grenade's screen.
 *
 * The rider is content (Direction #7). Each grenade's compendium document authors it
 * as `system.rider`, per line where the lines print different rules; this module only
 * reads that shape. A weapon whose `rider` is null has none.
 */

import { CHARACTERISTICS } from '../data/shared/characteristics.ts';
import { parseQualityLevel } from '../utils/quality-id.ts';

/** Characteristics a rider's test may use: every characteristic but Influence, which no one tests against a grenade. */
export const RIDER_TEST_CHARACTERISTICS = CHARACTERISTICS.map((c) => c.key).filter((key) => key !== 'influence');

/**
 * How long a failed test's effect lasts.
 *
 * - `''`               — no printed duration (an instant effect, or the effect prose says it).
 * - `degreesOfFailure` — `base` rounds plus one round per degree of failure.
 * - `roll`             — `formula` rounds.
 * - `encounter`        — until the end of the encounter.
 */
export const RIDER_DURATION_KINDS = ['', 'degreesOfFailure', 'roll', 'encounter'] as const;
export type RiderDurationKind = (typeof RIDER_DURATION_KINDS)[number];

/** Whether an area's size is a radius (a Blast) or a diameter (a smokescreen). */
export const RIDER_AREA_MEASURES = ['radius', 'diameter'] as const;
export type RiderAreaMeasure = (typeof RIDER_AREA_MEASURES)[number];

/**
 * Who among the creatures caught the rider touches (#623).
 *
 * - `''`     — every creature caught.
 * - `psyker` — only a creature with a psy rating (a Psyk-out grenade's cloud).
 */
export const RIDER_AFFECTS = ['', 'psyker'] as const;
export type RiderAffects = (typeof RIDER_AFFECTS)[number];

/** A grenade's rider, as the weapon's `system.rider` stores it. */
export interface GrenadeRiderData {
    /**
     * The test each character in the area makes; `characteristic` '' when the rider has
     * no test. `psykerModifier` is a further modifier a psyker takes (a Spore Bomb's −20).
     */
    test: { characteristic: string; modifier: number; psykerModifier: number };
    /** Who among the creatures caught the rider touches. */
    affects: RiderAffects;
    /**
     * The condition registry id (`blinded`, `stunned`, …) a failed test applies for the
     * rider's duration; '' when the effect is no registry condition (a table roll, a
     * characteristic loss) and the effect prose is what the GM applies.
     */
    condition: string;
    /**
     * The area the rider covers, in metres. `size` '' takes the radius from the weapon's
     * Blast quality; otherwise a number or a dice formula the book prints.
     */
    area: { size: string; measure: RiderAreaMeasure };
    /** How long a failed test's effect lasts. */
    duration: { kind: RiderDurationKind; base: number; formula: string };
    /** A step added to the effect's table roll per degree of failure, capped at `max`; 0 for none. */
    effectRollShift: { perDegree: number; max: number };
    /**
     * The characteristic damage a failed test deals (a Rad grenade's 2d10 Toughness):
     * `formula` rolled, plus `perDegree` per degree of failure. `characteristic` '' and
     * `formula` '' when the rider deals none.
     */
    characteristicDamage: { characteristic: string; formula: string; perDegree: number };
    /** The effect, as the book states it. */
    effect: string;
}

/** The weapon fields the rider readers take (WeaponData's). */
export interface RiderWeaponSystem {
    rider?: GrenadeRiderData | null;
    /** The weapon's quality ids. */
    special?: ReadonlySet<string>;
    /** Whether the weapon rolls damage (WeaponData's getter; false for a "–" damage line). */
    dealsDamage?: boolean;
}

/** The Blast quality's id; its rating is the blast radius in metres. */
const BLAST_QUALITY = 'blast';

/** Whether the weapon carries a rider. */
export function hasGrenadeRider<T extends RiderWeaponSystem>(system: T): system is T & { rider: GrenadeRiderData } {
    return system.rider !== undefined && system.rider !== null;
}

/** Whether the rider has its targets test (a Smoke grenade's screen, Tears of the Emperor's strike, have none). */
export function riderHasTest(rider: GrenadeRiderData): boolean {
    return rider.test.characteristic !== '';
}

/** Whether a failed test against the rider deals characteristic damage (#698). */
export function riderDealsCharacteristicDamage(rider: GrenadeRiderData): boolean {
    return rider.characteristicDamage.characteristic !== '' && rider.characteristicDamage.formula !== '';
}

/**
 * Whether the rider has anything to resolve against the creatures caught (#623): a test
 * to roll, or a registry condition to apply. A rider that is only prose (a smokescreen,
 * Tears of the Emperor's strike) is stated on the card and adjudicated by the GM.
 */
export function riderIsResolvable(rider: GrenadeRiderData): boolean {
    return riderHasTest(rider) || rider.condition !== '';
}

/** The radius in metres of an area `size` metres across as `measure` (a smokescreen's diameter halves). */
export function riderRadiusMetres(size: number, measure: RiderAreaMeasure): number {
    return measure === 'diameter' ? size / 2 : size;
}

/**
 * Whether a rider grenade takes the weapon roll (#622): one that deals damage throws on
 * BS, scatters, places its Blast and rolls its damage before its rider applies. One that
 * deals none is thrown from the grenade dialog, whose card carries the rider.
 */
export function riderTakesWeaponRoll(system: RiderWeaponSystem): boolean {
    return system.dealsDamage === true;
}

/** The weapon's Blast rating in metres, or null when it has no rated Blast. */
export function blastRating(special: ReadonlySet<string>): number | null {
    for (const id of special) {
        const { baseId, level } = parseQualityLevel(id);
        if (baseId === BLAST_QUALITY && level !== null) return level;
    }
    return null;
}

/** The rider's area: the printed size, or the weapon's Blast rating as a radius; null when neither exists. */
export function riderArea(rider: GrenadeRiderData, special: ReadonlySet<string>): { size: string; measure: RiderAreaMeasure } | null {
    if (rider.area.size !== '') return { size: rider.area.size, measure: rider.area.measure };
    const blast = blastRating(special);
    return blast === null ? null : { size: String(blast), measure: 'radius' };
}
