import { describe, expect, it } from 'vitest';
import {
    advanceSeconds,
    DAY_SECONDS,
    dayNumberSince,
    daysSince,
    formatClock,
    formatRemaining,
    gateRemaining,
    HOUR_SECONDS,
    hoursSince,
    isGateOpen,
} from './world-time.ts';

describe('world-time constants (#455)', () => {
    it('models a 24-hour day (SIMPLIFIED_GREGORIAN, V14 core default)', () => {
        expect(HOUR_SECONDS).toBe(3600);
        expect(DAY_SECONDS).toBe(86400);
    });
});

describe('hoursSince / daysSince', () => {
    it('measures elapsed in-universe time', () => {
        expect(hoursSince(0, 2 * HOUR_SECONDS)).toBe(2);
        expect(daysSince(0, 3 * DAY_SECONDS)).toBe(3);
        expect(hoursSince(1000, 1000 + HOUR_SECONDS / 2)).toBe(0.5);
    });

    it('never reports negative elapsed time (clock wound back)', () => {
        expect(hoursSince(5 * HOUR_SECONDS, 0)).toBe(0);
        expect(daysSince(5 * DAY_SECONDS, 0)).toBe(0);
    });
});

describe('isGateOpen — the per-target cooldown primitive (#458 First Aid 24h)', () => {
    it('an unset gate is open', () => {
        expect(isGateOpen(null, 0)).toBe(true);
    });

    it('stays closed until in-universe time reaches the expiry, then opens', () => {
        const now = 1_000_000;
        const expiry = now + DAY_SECONDS; // First Aid: stamped 24h out
        expect(isGateOpen(expiry, now)).toBe(false);
        expect(isGateOpen(expiry, now + DAY_SECONDS - 1)).toBe(false);
        // Exactly 24h later the gate reopens.
        expect(isGateOpen(expiry, now + DAY_SECONDS)).toBe(true);
        expect(isGateOpen(expiry, now + 2 * DAY_SECONDS)).toBe(true);
    });

    it('expresses a random window too (Interrogation 1d5 days) — the expiry carries it', () => {
        const now = 500;
        const expiry = now + 3 * DAY_SECONDS; // a 1d5 roll of 3
        expect(isGateOpen(expiry, now + 2 * DAY_SECONDS)).toBe(false);
        expect(isGateOpen(expiry, now + 3 * DAY_SECONDS)).toBe(true);
    });
});

describe('gateRemaining', () => {
    it('counts down to zero as in-universe time reaches the expiry', () => {
        const now = 500;
        const expiry = now + DAY_SECONDS;
        expect(gateRemaining(expiry, now)).toBe(DAY_SECONDS);
        expect(gateRemaining(expiry, now + HOUR_SECONDS)).toBe(DAY_SECONDS - HOUR_SECONDS);
        expect(gateRemaining(expiry, now + DAY_SECONDS)).toBe(0);
        expect(gateRemaining(expiry, now + 10 * DAY_SECONDS)).toBe(0);
    });

    it('is zero for an unset gate', () => {
        expect(gateRemaining(null, 12345)).toBe(0);
    });
});

describe('formatRemaining — effects-panel readout', () => {
    it('formats days, hours, minutes and seconds with the largest two units', () => {
        expect(formatRemaining(2 * DAY_SECONDS)).toBe('2d');
        expect(formatRemaining(2 * DAY_SECONDS + 3 * HOUR_SECONDS)).toBe('2d 3h');
        expect(formatRemaining(HOUR_SECONDS + 30 * 60)).toBe('1h 30m');
        expect(formatRemaining(2 * HOUR_SECONDS)).toBe('2h');
        expect(formatRemaining(90)).toBe('1m 30s');
        expect(formatRemaining(120)).toBe('2m');
        expect(formatRemaining(45)).toBe('45s');
    });

    it('floors at zero for elapsed / negative durations', () => {
        expect(formatRemaining(0)).toBe('0s');
        expect(formatRemaining(-500)).toBe('0s');
    });
});

describe('dayNumberSince — the Day-since-inception counter (#487)', () => {
    it('reads Day 0 on the day of inception, then counts completed days', () => {
        const inception = 1_000_000;
        expect(dayNumberSince(inception, inception)).toBe(0);
        // Part-way through the first day is still Day 0.
        expect(dayNumberSince(inception, inception + 12 * HOUR_SECONDS)).toBe(0);
        // A full day later rolls to Day 1; four days → Day 4 (#487 "Day 0/1/2/3/4").
        expect(dayNumberSince(inception, inception + DAY_SECONDS)).toBe(1);
        expect(dayNumberSince(inception, inception + DAY_SECONDS + 1)).toBe(1);
        expect(dayNumberSince(inception, inception + 4 * DAY_SECONDS)).toBe(4);
    });

    it('anchors Day 0 at the world epoch when inception defaults to 0', () => {
        expect(dayNumberSince(0, 0)).toBe(0);
        expect(dayNumberSince(0, 3 * DAY_SECONDS)).toBe(3);
    });

    it('never reads negative before inception (clock wound back)', () => {
        const inception = 5 * DAY_SECONDS;
        expect(dayNumberSince(inception, 0)).toBe(0);
        expect(dayNumberSince(inception, 2 * DAY_SECONDS)).toBe(0);
    });
});

describe('advanceSeconds — GM advance-amount math (#487)', () => {
    it('converts a whole-unit count to seconds', () => {
        expect(advanceSeconds(1, 'hour')).toBe(HOUR_SECONDS);
        expect(advanceSeconds(1, 'day')).toBe(DAY_SECONDS);
        expect(advanceSeconds(6, 'hour')).toBe(6 * HOUR_SECONDS);
        expect(advanceSeconds(2, 'day')).toBe(2 * DAY_SECONDS);
    });

    it('truncates a fractional count to a whole unit', () => {
        expect(advanceSeconds(2.9, 'hour')).toBe(2 * HOUR_SECONDS);
        expect(advanceSeconds(1.5, 'day')).toBe(DAY_SECONDS);
    });

    it('yields a no-op (0) for a non-finite count', () => {
        expect(advanceSeconds(Number.NaN, 'hour')).toBe(0);
        expect(advanceSeconds(Number.POSITIVE_INFINITY, 'day')).toBe(0);
    });

    it('preserves a negative count (Foundry rewinds on a negative delta)', () => {
        expect(advanceSeconds(-3, 'hour')).toBe(-3 * HOUR_SECONDS);
    });
});

describe('formatClock — time-of-day fallback readout (#487)', () => {
    it('zero-pads to HH:MM', () => {
        expect(formatClock(9, 5)).toBe('09:05');
        expect(formatClock(14, 30)).toBe('14:30');
        expect(formatClock(0, 0)).toBe('00:00');
    });

    it('includes seconds when provided', () => {
        expect(formatClock(9, 5, 3)).toBe('09:05:03');
        expect(formatClock(23, 59, 59)).toBe('23:59:59');
    });

    it('truncates fractional component values', () => {
        expect(formatClock(9.8, 5.2, 3.9)).toBe('09:05:03');
    });
});
