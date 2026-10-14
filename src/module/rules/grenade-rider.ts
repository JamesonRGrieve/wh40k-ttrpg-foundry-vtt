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

/** A grenade's rider, as the weapon's `system.rider` stores it. */
export interface GrenadeRiderData {
    /** The test each character in the area makes; `characteristic` '' when the rider has no test. */
    test: { characteristic: string; modifier: number };
    /**
     * The area the rider covers, in metres. `size` '' takes the radius from the weapon's
     * Blast quality; otherwise a number or a dice formula the book prints.
     */
    area: { size: string; measure: RiderAreaMeasure };
    /** How long a failed test's effect lasts. */
    duration: { kind: RiderDurationKind; base: number; formula: string };
    /** A step added to the effect's table roll per degree of failure, capped at `max`; 0 for none. */
    effectRollShift: { perDegree: number; max: number };
    /** The effect, as the book states it. */
    effect: string;
}

/** The weapon fields the rider readers take (WeaponData's). */
export interface RiderWeaponSystem {
    rider?: GrenadeRiderData | null;
    /** The weapon's quality ids. */
    special?: ReadonlySet<string>;
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
