import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, daysSince, formatRemaining, gateRemaining, HOUR_SECONDS, hoursSince, isGateOpen } from './world-time.ts';

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
