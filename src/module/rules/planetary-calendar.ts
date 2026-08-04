/**
 * @file Per-body planetary calendar (#536).
 *
 * Converts elapsed Terran-standard seconds into local time for a celestial
 * body with a known rotation period. `game.time.worldTime` stays in Terran
 * seconds — this is a pure display-layer conversion.
 */

import { HOUR_SECONDS } from './world-time.ts';

export interface CelestialBody {
    name: string;
    rotationHours: number;
}

const TERRAN_DAY_SECONDS = 24 * HOUR_SECONDS;

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

export function terranDayNumber(elapsedTerranSeconds: number): number {
    return Math.floor(elapsedTerranSeconds / TERRAN_DAY_SECONDS);
}

export function terranTimeOfDay(elapsedTerranSeconds: number): { hour: number; minute: number } {
    const intoDay = ((elapsedTerranSeconds % TERRAN_DAY_SECONDS) + TERRAN_DAY_SECONDS) % TERRAN_DAY_SECONDS;
    const hour = Math.floor(intoDay / HOUR_SECONDS);
    const minute = Math.floor((intoDay % HOUR_SECONDS) / 60);
    return { hour, minute };
}

export const SOLENNE_SYSTEM: Record<string, CelestialBody> = {
    'solenne-majoris': { name: 'Solenne Majoris', rotationHours: 26 },
    'solenne-minoris': { name: 'Solenne Minoris', rotationHours: 19 },
    'terran-standard': { name: 'Terran Standard', rotationHours: 24 },
};

export function resolveBody(locationKey: string | null): CelestialBody {
    if (locationKey !== null && SOLENNE_SYSTEM[locationKey] !== undefined) {
        return SOLENNE_SYSTEM[locationKey];
    }
    return SOLENNE_SYSTEM['terran-standard'];
}
