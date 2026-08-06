/**
 * @file Per-body planetary calendar (#536).
 *
 * Converts elapsed Terran-standard seconds into local time for a celestial
 * body with a known rotation period. `game.time.worldTime` stays in Terran
 * seconds — this is a pure display-layer conversion.
 */

import { DAY_SECONDS, HOUR_SECONDS } from './world-time.ts';

export interface CelestialBody {
    name: string;
    rotationHours: number;
    orbitalDays?: number;
    axialTilt?: number;
}

export interface SeasonInfo {
    name: string;
    icon: string;
}

const SEASONS: SeasonInfo[] = [
    { name: 'Early Spring', icon: 'seedling' },
    { name: 'Late Spring', icon: 'leaf' },
    { name: 'Early Summer', icon: 'sun' },
    { name: 'Late Summer', icon: 'sun' },
    { name: 'Early Autumn', icon: 'wind' },
    { name: 'Late Autumn', icon: 'wind' },
    { name: 'Early Winter', icon: 'snowflake' },
    { name: 'Deep Winter', icon: 'snowflake' },
];

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

export function localSeason(elapsedTerranSeconds: number, body: CelestialBody): SeasonInfo | null {
    if (body.orbitalDays === undefined || body.orbitalDays <= 0) return null;
    const orbitalSeconds = body.orbitalDays * DAY_SECONDS;
    const intoOrbit = ((elapsedTerranSeconds % orbitalSeconds) + orbitalSeconds) % orbitalSeconds;
    const fraction = intoOrbit / orbitalSeconds;
    const index = Math.floor(fraction * SEASONS.length) % SEASONS.length;
    return SEASONS[index];
}

export function terranDayNumber(elapsedTerranSeconds: number): number {
    return Math.floor(elapsedTerranSeconds / (24 * HOUR_SECONDS));
}

export const SOLENNE_SYSTEM: Record<string, CelestialBody> = {
    'solenne-majoris': { name: 'Solenne Majoris', rotationHours: 26, orbitalDays: 340, axialTilt: 18 },
    'solenne-minoris': { name: 'Solenne Minoris', rotationHours: 19, orbitalDays: 340, axialTilt: 5 },
    'terran-standard': { name: 'Terran Standard', rotationHours: 24 },
};

export function resolveBody(locationKey: string | null): CelestialBody {
    if (locationKey !== null && SOLENNE_SYSTEM[locationKey] !== undefined) {
        return SOLENNE_SYSTEM[locationKey];
    }
    return SOLENNE_SYSTEM['terran-standard'];
}
