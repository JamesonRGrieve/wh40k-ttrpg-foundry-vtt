import { describe, expect, it } from 'vitest';
import { ADDICTION_TREATMENT_DAYS, getTreatmentClockDays, resolveAddictionCheck } from './addiction';

/**
 * Drugs and Addiction tests (#122 — core.md L7530-7630).
 *
 * Pins the addiction-check target math (WP − substance rating) and the
 * tier-escalation ladder (none → mild → moderate → severe) along with
 * the treatment-clock day counts.
 */
describe('resolveAddictionCheck (#122)', () => {
    it('target = WP − substance rating', () => {
        expect(resolveAddictionCheck({ willpowerTotal: 50, substanceRating: 10, currentTier: 'none' }).target).toBe(40);
        expect(resolveAddictionCheck({ willpowerTotal: 30, substanceRating: 5, currentTier: 'mild' }).target).toBe(25);
    });

    it('target floors at 0', () => {
        expect(resolveAddictionCheck({ willpowerTotal: 10, substanceRating: 20, currentTier: 'none' }).target).toBe(0);
    });

    it('escalates one tier per failure (none → mild → moderate → severe)', () => {
        const ladder: Array<['none' | 'mild' | 'moderate', 'mild' | 'moderate' | 'severe']> = [
            ['none', 'mild'],
            ['mild', 'moderate'],
            ['moderate', 'severe'],
        ];
        for (const [from, to] of ladder) {
            const r = resolveAddictionCheck({ willpowerTotal: 40, substanceRating: 10, currentTier: from });
            expect(r.nextTierOnFailure).toBe(to);
        }
    });

    it('severe stays severe (no further escalation)', () => {
        const r = resolveAddictionCheck({ willpowerTotal: 40, substanceRating: 10, currentTier: 'severe' });
        expect(r.nextTierOnFailure).toBe('severe');
    });

    it('truncates fractional inputs', () => {
        expect(resolveAddictionCheck({ willpowerTotal: 50.7, substanceRating: 10.3, currentTier: 'none' }).target).toBe(40);
    });
});

describe('treatment-clock days (#122)', () => {
    it('exposes the per-tier day counts', () => {
        expect(ADDICTION_TREATMENT_DAYS.none).toBe(0);
        expect(ADDICTION_TREATMENT_DAYS.mild).toBe(7);
        expect(ADDICTION_TREATMENT_DAYS.moderate).toBe(30);
        expect(ADDICTION_TREATMENT_DAYS.severe).toBe(90);
    });

    it('getTreatmentClockDays returns the matching value', () => {
        expect(getTreatmentClockDays('mild')).toBe(7);
        expect(getTreatmentClockDays('severe')).toBe(90);
    });
});
