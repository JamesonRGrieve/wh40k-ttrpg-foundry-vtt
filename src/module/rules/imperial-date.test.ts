import { describe, expect, it } from 'vitest';
import {
    addSecondsToImperialDate,
    FRACTION_SECONDS,
    formatImperialDate,
    imperialDateFromAbsoluteSeconds,
    imperialDateToAbsoluteSeconds,
    parseImperialDate,
} from './imperial-date.ts';
import { DAY_SECONDS, HOUR_SECONDS } from './world-time.ts';

/**
 * An arbitrary well-formed stamp used as the arithmetic fixture. It is test data
 * only — no real campaign's inception date belongs in the system repo; that is
 * per-world data (see `CAMPAIGN_INCEPTION_DATE_DEFAULT`).
 */
const LANDING = '5.420.816.M41';

describe('parseImperialDate', () => {
    it('parses a canonical stamp', () => {
        expect(parseImperialDate(LANDING)).toEqual({ check: 5, fraction: 420, year: 816, millennium: 41 });
    });

    it('tolerates surrounding whitespace', () => {
        expect(parseImperialDate('  0.000.001.M1  ')).toEqual({ check: 0, fraction: 0, year: 1, millennium: 1 });
    });

    it.each([
        ['5.42.816.M41', 'fraction not zero-padded to three digits'],
        ['5.420.816.41', 'missing the millennium M'],
        ['55.420.816.M41', 'two-digit check number'],
        ['', 'empty'],
        ['not a date', 'garbage'],
        ['5.420.816.M0', 'millennium below 1'],
    ])('rejects %s (%s)', (value) => {
        expect(parseImperialDate(value)).toBeNull();
    });
});

describe('formatImperialDate', () => {
    it('round-trips the canonical stamp', () => {
        const parsed = parseImperialDate(LANDING);
        expect(parsed).not.toBeNull();
        expect(formatImperialDate(parsed as NonNullable<typeof parsed>)).toBe(LANDING);
    });

    it('zero-pads fraction and year', () => {
        expect(formatImperialDate({ check: 0, fraction: 7, year: 42, millennium: 41 })).toBe('0.007.042.M41');
    });
});

describe('absolute-seconds conversion', () => {
    it('round-trips a date through absolute seconds', () => {
        const date = { check: 5, fraction: 420, year: 816, millennium: 41 };
        const seconds = imperialDateToAbsoluteSeconds(date);
        expect(imperialDateFromAbsoluteSeconds(seconds, 5)).toEqual(date);
    });

    it('carries the check number through unchanged (it describes the observer, not the instant)', () => {
        const seconds = imperialDateToAbsoluteSeconds({ check: 5, fraction: 420, year: 816, millennium: 41 });
        expect(imperialDateFromAbsoluteSeconds(seconds, 2).check).toBe(2);
    });

    it('floors partial fractions — a stamp names the fraction currently elapsing', () => {
        const base = imperialDateToAbsoluteSeconds({ check: 5, fraction: 420, year: 816, millennium: 41 });
        const almostNext = base + FRACTION_SECONDS * 0.99;
        expect(imperialDateFromAbsoluteSeconds(almostNext, 5).fraction).toBe(420);
    });

    it('clamps a negative absolute time to the epoch rather than producing a negative millennium', () => {
        expect(imperialDateFromAbsoluteSeconds(-1, 5).millennium).toBe(1);
    });
});

describe('addSecondsToImperialDate — the campaign clock', () => {
    const landing = parseImperialDate(LANDING) as NonNullable<ReturnType<typeof parseImperialDate>>;

    it('Day 0 is the inception stamp itself', () => {
        expect(formatImperialDate(addSecondsToImperialDate(landing, 0))).toBe(LANDING);
    });

    it('advances the fraction as in-universe days pass', () => {
        // One fraction is 8.766h, so a single day advances the stamp by 2 fractions
        // (24 / 8.766 = 2.73 → 420 + 2 completed).
        const oneDay = addSecondsToImperialDate(landing, DAY_SECONDS);
        expect(oneDay.fraction).toBe(422);
        expect(oneDay.year).toBe(816);
    });

    it('advances 13 fractions over 4 days and 18 hours', () => {
        // 4 days + 18h = 114h elapsed; 114 / 8.766 = 13.0 fractions → 420 + 13.
        const later = addSecondsToImperialDate(landing, 4 * DAY_SECONDS + 18 * HOUR_SECONDS);
        expect(formatImperialDate(later)).toBe('5.433.816.M41');
    });

    it('rolls into the next year when the fraction passes 999', () => {
        const nearYearEnd = { check: 5, fraction: 999, year: 816, millennium: 41 };
        const rolled = addSecondsToImperialDate(nearYearEnd, FRACTION_SECONDS * 2);
        expect(rolled.year).toBe(817);
        expect(rolled.fraction).toBe(0);
    });

    it('rolls into the next millennium at year 1000', () => {
        const endOfM41 = { check: 5, fraction: 999, year: 1000, millennium: 41 };
        const rolled = addSecondsToImperialDate(endOfM41, FRACTION_SECONDS * 2);
        expect(rolled.millennium).toBe(42);
    });

    it('never runs before inception — a rewound clock clamps to Day 0', () => {
        expect(formatImperialDate(addSecondsToImperialDate(landing, -DAY_SECONDS * 10))).toBe(LANDING);
    });
});
