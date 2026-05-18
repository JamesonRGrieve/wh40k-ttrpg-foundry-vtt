import { describe, expect, it } from 'vitest';
import { canUnleashDaemon, getResistDaemonTarget, resetSessionUnleash, spendUnleashDaemon } from './possession';

describe('canUnleashDaemon (#82)', () => {
    it('returns false in the none state regardless of charges', () => {
        expect(canUnleashDaemon({ state: 'none', unleashUsed: 0, unleashMax: 3 })).toBe(false);
    });
    it('returns true when latent + charges remain', () => {
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 })).toBe(true);
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 1, unleashMax: 2 })).toBe(true);
    });
    it('returns false when used == max', () => {
        expect(canUnleashDaemon({ state: 'latent', unleashUsed: 2, unleashMax: 2 })).toBe(false);
    });
    it('returns true when possessed + charges remain', () => {
        expect(canUnleashDaemon({ state: 'possessed', unleashUsed: 0, unleashMax: 3 })).toBe(true);
    });
});

describe('spendUnleashDaemon (#82)', () => {
    it('increments unleashUsed when a charge is available', () => {
        const next = spendUnleashDaemon({ state: 'latent', unleashUsed: 0, unleashMax: 2 });
        expect(next.unleashUsed).toBe(1);
    });
    it('is a no-op when no charge is available', () => {
        const slot = { state: 'latent' as const, unleashUsed: 2, unleashMax: 2 };
        expect(spendUnleashDaemon(slot)).toEqual(slot);
    });
    it('is a no-op in the none state', () => {
        const slot = { state: 'none' as const, unleashUsed: 0, unleashMax: 3 };
        expect(spendUnleashDaemon(slot)).toEqual(slot);
    });
});

describe('resetSessionUnleash (#82)', () => {
    it('resets unleashUsed to 0 and preserves state / max', () => {
        const slot = { state: 'possessed' as const, unleashUsed: 3, unleashMax: 4 };
        const next = resetSessionUnleash(slot);
        expect(next.unleashUsed).toBe(0);
        expect(next.state).toBe('possessed');
        expect(next.unleashMax).toBe(4);
    });
});

describe('getResistDaemonTarget (#82)', () => {
    it('returns full WP at tier 0 (CP 0..30)', () => {
        expect(getResistDaemonTarget(50, 0)).toBe(50);
        expect(getResistDaemonTarget(50, 30)).toBe(50);
    });
    it('subtracts 10 at tier 1 (CP 31..60)', () => {
        expect(getResistDaemonTarget(50, 31)).toBe(40);
        expect(getResistDaemonTarget(50, 60)).toBe(40);
    });
    it('subtracts 20 at tier 2 (CP 61..90)', () => {
        expect(getResistDaemonTarget(50, 61)).toBe(30);
        expect(getResistDaemonTarget(50, 90)).toBe(30);
    });
    it('subtracts 30 at tier 3 (CP 91+)', () => {
        expect(getResistDaemonTarget(50, 91)).toBe(20);
        expect(getResistDaemonTarget(50, 200)).toBe(20);
    });
    it('floors at 0 (never negative)', () => {
        expect(getResistDaemonTarget(10, 91)).toBe(0);
        expect(getResistDaemonTarget(0, 0)).toBe(0);
    });
});
