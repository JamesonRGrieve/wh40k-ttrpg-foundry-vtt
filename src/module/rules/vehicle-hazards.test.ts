import { describe, expect, it } from 'vitest';
import { getRepairDifficulty, resolveHazardRoll } from './vehicle-hazards';

describe('resolveHazardRoll', () => {
    it('returns the Out of Control entry for the bucket', () => {
        expect(resolveHazardRoll('outOfControl', 1)?.label).toBe('Wide Skid');
        expect(resolveHazardRoll('outOfControl', 5)?.label).toBe('Sideswipe');
        expect(resolveHazardRoll('outOfControl', 10)?.label).toBe('Crash');
    });

    it('returns the Crash entry for the bucket', () => {
        expect(resolveHazardRoll('crash', 2)?.label).toBe('Glancing');
        expect(resolveHazardRoll('crash', 10)?.label).toBe('Catastrophic');
    });

    it('returns the On Fire entry for the bucket', () => {
        expect(resolveHazardRoll('onFire', 1)?.label).toBe('Smouldering');
        expect(resolveHazardRoll('onFire', 10)?.label).toBe('Detonation');
    });

    it('clamps out-of-range rolls into the table', () => {
        expect(resolveHazardRoll('outOfControl', 0)?.label).toBe('Wide Skid');
        expect(resolveHazardRoll('outOfControl', 999)?.label).toBe('Crash');
    });
});

describe('getRepairDifficulty', () => {
    it('returns 0 (Ordinary) at 75%+ integrity', () => {
        expect(getRepairDifficulty(10, 10)).toBe(0);
        expect(getRepairDifficulty(8, 10)).toBe(0);
    });
    it('returns −10 (Difficult) at 50–74%', () => {
        expect(getRepairDifficulty(6, 10)).toBe(-10);
    });
    it('returns −20 (Hard) at 25–49%', () => {
        expect(getRepairDifficulty(3, 10)).toBe(-20);
    });
    it('returns −30 (Very Hard) below 25%', () => {
        expect(getRepairDifficulty(1, 10)).toBe(-30);
        expect(getRepairDifficulty(0, 10)).toBe(-30);
    });
    it('handles max=0 safely (no modifier)', () => {
        expect(getRepairDifficulty(0, 0)).toBe(0);
    });
});
