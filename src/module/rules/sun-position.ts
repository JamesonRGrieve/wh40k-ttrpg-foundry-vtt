/**
 * @file Where a body's sun stands in a scene's sky (#588 follow-up, operator 2026-10-06: latitude + axial tilt).
 *
 * A scene bound to a celestial body and given a latitude has a sun: its compass
 * azimuth (0 north, 90 east) and its elevation above the horizon, in degrees,
 * from the body's local hour, its place in its year and its axial tilt. Drop
 * shadows drawn by the Zephyr Cartography module fall away from it, so they
 * lengthen at dawn and dusk, swing with the hour, ride higher in summer and
 * point the other way in the other hemisphere.
 *
 * The year starts at the spring equinox, as the calendar's seasons do
 * (`planetary-calendar.ts` `localSeason`), and local noon is half a rotation
 * after local midnight, as the darkness curve has it (`scene-lighting.ts`
 * `daylight`). A body with no tilt or no known year stands at the equinox all
 * year. Pure: the scene write lives in the hooks manager.
 */

import { localHourOfDay, orbitFraction } from './planetary-calendar.ts';
import type { CelestialBodyRecord } from './scene-lighting.ts';

/** Where the sun stands: compass azimuth (0–360) and elevation above the horizon (−90–90), in degrees. */
export interface SunPosition {
    azimuth: number;
    elevation: number;
}

const RADIANS = Math.PI / 180;

/** The smallest change, in degrees, worth writing a scene's sun again (avoids write spam as the clock ticks). */
const SUN_EPSILON_DEGREES = 1;

/** The sun's declination in degrees: the tilt's full swing at the solstices, 0 at the equinoxes. */
export function solarDeclination(year: number | null, axialTilt: number | undefined): number {
    if (year === null || axialTilt === undefined) return 0;
    return axialTilt * Math.sin(2 * Math.PI * year);
}

/**
 * The sun's place in the sky for an observer at `latitude` (degrees, north positive) when the body is `day` through
 * its local day and the sun stands at `declination`.
 */
export function sunPosition(day: number, declination: number, latitude: number): SunPosition {
    const hourAngle = 2 * Math.PI * (day - 0.5);
    const phi = latitude * RADIANS;
    const delta = declination * RADIANS;
    const sinElevation = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
    const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation))) / RADIANS;
    // Measured from north, clockwise: east before noon (hour angle negative), west after.
    const azimuth =
        Math.atan2(-Math.cos(delta) * Math.sin(hourAngle), Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.cos(hourAngle) * Math.sin(phi)) / RADIANS;
    return { azimuth: Math.round((((azimuth % 360) + 360) % 360) * 10) / 10, elevation: Math.round(elevation * 10) / 10 };
}

/** The sun over a scene at `latitude` on `body`, `elapsedTerranSeconds` after the world clock's inception. */
export function bodySun(elapsedTerranSeconds: number, body: CelestialBodyRecord, latitude: number): SunPosition {
    const declination = solarDeclination(orbitFraction(elapsedTerranSeconds, body), body.axialTilt);
    return sunPosition(localHourOfDay(elapsedTerranSeconds, body) / body.rotationHours, declination, latitude);
}

/** Has the sun moved far enough from `current` (null: none stored) to be worth writing? */
export function sunChanged(current: SunPosition | null, next: SunPosition): boolean {
    if (current === null) return true;
    const turn = Math.abs(((next.azimuth - current.azimuth + 540) % 360) - 180);
    return turn >= SUN_EPSILON_DEGREES || Math.abs(next.elevation - current.elevation) >= SUN_EPSILON_DEGREES;
}

/** A stored sun read defensively (a cartography scene flag): two finite numbers, else null. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#getFlag returns the stored flag JSON untyped
export function parseStoredSun(value: unknown): SunPosition | null {
    if (typeof value !== 'object' || value === null || !('azimuth' in value) || !('elevation' in value)) return null;
    const { azimuth, elevation } = value;
    return typeof azimuth === 'number' && typeof elevation === 'number' && Number.isFinite(azimuth) && Number.isFinite(elevation)
        ? { azimuth, elevation }
        : null;
}
