import { describe, expect, it } from 'vitest';
import type { CelestialBodyRecord } from './scene-lighting.ts';
import { bodySun, parseStoredSun, solarDeclination, sunChanged, sunPosition } from './sun-position.ts';
import { HOUR_SECONDS } from './world-time.ts';

const TILT = 23.44;

describe('solarDeclination', () => {
    it('swings the full tilt at the solstices and crosses 0 at the equinoxes', () => {
        expect(solarDeclination(0, TILT)).toBeCloseTo(0, 9);
        expect(solarDeclination(0.25, TILT)).toBeCloseTo(TILT, 9);
        expect(solarDeclination(0.5, TILT)).toBeCloseTo(0, 9);
        expect(solarDeclination(0.75, TILT)).toBeCloseTo(-TILT, 9);
    });

    it('stands at the equinox all year with no known year or no tilt', () => {
        expect(solarDeclination(null, TILT)).toBe(0);
        expect(solarDeclination(0.25, undefined)).toBe(0);
    });
});

describe('sunPosition', () => {
    it('stands overhead at noon on the equator at the equinox', () => {
        expect(sunPosition(0.5, 0, 0).elevation).toBeCloseTo(90, 5);
    });

    it('stands due south at noon in the north and due north in the south', () => {
        expect(sunPosition(0.5, 0, 45)).toEqual({ azimuth: 180, elevation: 45 });
        expect(sunPosition(0.5, 0, -45)).toEqual({ azimuth: 0, elevation: 45 });
    });

    it('rises in the east and sets in the west at the equinox', () => {
        expect(sunPosition(0.25, 0, 45)).toEqual({ azimuth: 90, elevation: 0 });
        expect(sunPosition(0.75, 0, 45)).toEqual({ azimuth: 270, elevation: 0 });
    });

    it('is below the horizon at midnight', () => {
        expect(sunPosition(0, 0, 45).elevation).toBeCloseTo(-45, 5);
    });

    it('rides higher at the summer solstice', () => {
        expect(sunPosition(0.5, TILT, 45).elevation).toBeCloseTo(45 + TILT, 1);
        expect(sunPosition(0.5, -TILT, 45).elevation).toBeCloseTo(45 - TILT, 1);
    });
});

describe('bodySun', () => {
    const terra: CelestialBodyRecord = { name: 'Terra', rotationHours: 24, orbitalDays: 365.25, axialTilt: TILT, weather: 'clear' };

    it('follows the body’s local hour, a few hours past the spring equinox', () => {
        const noon = bodySun(12 * HOUR_SECONDS, terra, 45);
        expect(noon.azimuth).toBe(180);
        // Half a day into the year the sun has climbed 0.2° north of the equinox.
        expect(noon.elevation).toBeCloseTo(45.2, 1);
        expect(bodySun(6 * HOUR_SECONDS, terra, 45).azimuth).toBeCloseTo(90, 0);
    });

    it('climbs with the season towards the summer solstice', () => {
        // Noon on day 91: a quarter of the year round, local noon on the body's own day.
        const solsticeNoon = 91 * 24 * HOUR_SECONDS + 12 * HOUR_SECONDS;
        expect(bodySun(solsticeNoon, terra, 45).elevation).toBeCloseTo(45 + TILT, 0);
    });

    it('reads the local hour on the body’s own rotation', () => {
        const fast: CelestialBodyRecord = { name: 'Fast', rotationHours: 10, weather: 'clear' };
        expect(bodySun(5 * HOUR_SECONDS, fast, 45)).toEqual({ azimuth: 180, elevation: 45 });
    });
});

describe('sunChanged', () => {
    it('writes a first sun', () => {
        expect(sunChanged(null, { azimuth: 10, elevation: 10 })).toBe(true);
    });

    it('ignores less than a degree, across north too', () => {
        expect(sunChanged({ azimuth: 100, elevation: 30 }, { azimuth: 100.5, elevation: 30.5 })).toBe(false);
        expect(sunChanged({ azimuth: 359.6, elevation: 30 }, { azimuth: 0.2, elevation: 30 })).toBe(false);
    });

    it('writes a degree or more', () => {
        expect(sunChanged({ azimuth: 100, elevation: 30 }, { azimuth: 101, elevation: 30 })).toBe(true);
        expect(sunChanged({ azimuth: 100, elevation: 30 }, { azimuth: 100, elevation: 28.5 })).toBe(true);
    });
});

describe('parseStoredSun', () => {
    it('reads a stored sun', () => {
        expect(parseStoredSun({ azimuth: 315, elevation: 45 })).toEqual({ azimuth: 315, elevation: 45 });
    });

    it('is null for anything else', () => {
        expect(parseStoredSun(undefined)).toBeNull();
        expect(parseStoredSun({ azimuth: 315 })).toBeNull();
        expect(parseStoredSun({ azimuth: '315', elevation: 45 })).toBeNull();
        expect(parseStoredSun({ azimuth: Number.NaN, elevation: 45 })).toBeNull();
    });
});
