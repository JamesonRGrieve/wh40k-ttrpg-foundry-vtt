import { describe, expect, it } from 'vitest';
import {
    type CelestialBody,
    localDayNumber,
    localHourOfDay,
    localSeason,
    localTimeOfDay,
    TERRAN_ROTATION_HOURS,
    terranToLocalDays,
} from './planetary-calendar.ts';
import { DAY_SECONDS, HOUR_SECONDS } from './world-time.ts';

const MOON: CelestialBody = { name: 'Moon', rotationHours: 20, orbitalDays: 80 };

describe('local time on a body', () => {
    it('counts local days by the body rotation', () => {
        expect(terranToLocalDays(40 * HOUR_SECONDS, MOON)).toBe(2);
        expect(localDayNumber(39 * HOUR_SECONDS, MOON)).toBe(1);
    });

    it('reads the local hour and minute, wrapping each rotation', () => {
        expect(localTimeOfDay(25.5 * HOUR_SECONDS, MOON)).toEqual({ hour: 5, minute: 30 });
        expect(localHourOfDay(25.5 * HOUR_SECONDS, MOON)).toBe(5.5);
    });

    it('handles time before the epoch', () => {
        expect(localTimeOfDay(-1 * HOUR_SECONDS, MOON)).toEqual({ hour: 19, minute: 0 });
    });

    it('matches the Terran clock on a Terran-standard body', () => {
        const terran: CelestialBody = { name: 'Terra', rotationHours: TERRAN_ROTATION_HOURS };
        expect(localTimeOfDay(DAY_SECONDS + 3 * HOUR_SECONDS, terran)).toEqual({ hour: 3, minute: 0 });
    });
});

describe('localSeason', () => {
    it('walks eight seasons across the orbit as langpack keys', () => {
        expect(localSeason(0, MOON)?.labelKey).toBe('WH40K.Season.EarlySpring');
        expect(localSeason(75 * DAY_SECONDS, MOON)?.labelKey).toBe('WH40K.Season.DeepWinter');
    });

    it('is null for a body with no orbital period', () => {
        expect(localSeason(0, { name: 'Station', rotationHours: 24 })).toBeNull();
    });
});
