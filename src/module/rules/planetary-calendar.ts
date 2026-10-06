/**
 * @file Per-body planetary calendar (#536).
 *
 * Converts elapsed Terran-standard seconds into local time for a celestial
 * body with a known rotation period. `game.time.worldTime` stays in Terran
 * seconds — this is a pure display-layer conversion. The bodies themselves are
 * world data (the `celestial-bodies` setting, see `scene-lighting.ts`), never
 * campaign constants in `src/`.
 */

import { DAY_SECONDS, HOUR_SECONDS } from './world-time.ts';

export interface CelestialBody {
    name: string;
    rotationHours: number;
    orbitalDays?: number | undefined;
    axialTilt?: number | undefined;
}

export interface SeasonInfo {
    /** Langpack key for the season's name. */
    labelKey: string;
    icon: string;
}

const SEASONS: SeasonInfo[] = [
    { labelKey: 'WH40K.Season.EarlySpring', icon: 'seedling' },
    { labelKey: 'WH40K.Season.LateSpring', icon: 'leaf' },
    { labelKey: 'WH40K.Season.EarlySummer', icon: 'sun' },
    { labelKey: 'WH40K.Season.LateSummer', icon: 'sun' },
    { labelKey: 'WH40K.Season.EarlyAutumn', icon: 'wind' },
    { labelKey: 'WH40K.Season.LateAutumn', icon: 'wind' },
    { labelKey: 'WH40K.Season.EarlyWinter', icon: 'snowflake' },
    { labelKey: 'WH40K.Season.DeepWinter', icon: 'snowflake' },
];

/** Rotation period of the Terran-standard fallback day, in hours. */
export const TERRAN_ROTATION_HOURS = 24;

export function localDaySeconds(body: CelestialBody): number {
    return body.rotationHours * HOUR_SECONDS;
}

export function terranToLocalDays(elapsedTerranSeconds: number, body: CelestialBody): number {
    return elapsedTerranSeconds / localDaySeconds(body);
}

export function localDayNumber(elapsedTerranSeconds: number, body: CelestialBody): number {
    return Math.floor(terranToLocalDays(elapsedTerranSeconds, body));
}

export function localTimeOfDay(elapsedTerranSeconds: number, body: CelestialBody): { hour: number; minute: number } {
    const dayLen = localDaySeconds(body);
    const intoDay = ((elapsedTerranSeconds % dayLen) + dayLen) % dayLen;
    const hour = Math.floor(intoDay / HOUR_SECONDS);
    const minute = Math.floor((intoDay % HOUR_SECONDS) / 60);
    return { hour, minute };
}

/** How far through its year (0–1, from the spring equinox) the body is, or null when its year is unknown. */
export function orbitFraction(elapsedTerranSeconds: number, body: CelestialBody): number | null {
    if (body.orbitalDays === undefined || body.orbitalDays <= 0) return null;
    const orbitalSeconds = body.orbitalDays * DAY_SECONDS;
    const intoOrbit = ((elapsedTerranSeconds % orbitalSeconds) + orbitalSeconds) % orbitalSeconds;
    return intoOrbit / orbitalSeconds;
}

export function localSeason(elapsedTerranSeconds: number, body: CelestialBody): SeasonInfo | null {
    const fraction = orbitFraction(elapsedTerranSeconds, body);
    if (fraction === null) return null;
    const index = Math.floor(fraction * SEASONS.length) % SEASONS.length;
    return SEASONS[index] ?? null;
}

export function terranDayNumber(elapsedTerranSeconds: number): number {
    return Math.floor(elapsedTerranSeconds / (24 * HOUR_SECONDS));
}

/** The body's local hour of day as a fractional hour (`13:30` → 13.5). */
export function localHourOfDay(elapsedTerranSeconds: number, body: CelestialBody): number {
    const { hour, minute } = localTimeOfDay(elapsedTerranSeconds, body);
    return hour + minute / 60;
}
