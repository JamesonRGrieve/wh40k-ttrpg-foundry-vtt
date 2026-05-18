import { describe, expect, it } from 'vitest';
import { applyInfectionDailyTick, isTreatmentComplete, resolveDiseaseExposure, type DiseaseProfile } from './disease';

const plague: DiseaseProfile = {
    id: 'redfly-plague',
    label: 'Redfly Plague',
    rating: 20,
    damagePerDay: 2,
    treatmentThreshold: 6,
};

describe('resolveDiseaseExposure (#123)', () => {
    it('target = TB total − disease rating, floored at 0', () => {
        expect(resolveDiseaseExposure({ toughnessTotal: 50, diseaseRating: 20 }).target).toBe(30);
        expect(resolveDiseaseExposure({ toughnessTotal: 10, diseaseRating: 50 }).target).toBe(0);
    });

    it('treats negative inputs as zero', () => {
        expect(resolveDiseaseExposure({ toughnessTotal: -5, diseaseRating: 10 }).target).toBe(0);
    });
});

describe('applyInfectionDailyTick (#123)', () => {
    it('applies the disease profile damagePerDay and accumulates', () => {
        const tick1 = applyInfectionDailyTick({ profile: plague, cumulativeSoFar: 0 });
        expect(tick1).toEqual({ damage: 2, cumulative: 2 });
        const tick2 = applyInfectionDailyTick({ profile: plague, cumulativeSoFar: tick1.cumulative });
        expect(tick2).toEqual({ damage: 2, cumulative: 4 });
    });

    it('does nothing when treatment has succeeded', () => {
        const tick = applyInfectionDailyTick({ profile: plague, cumulativeSoFar: 6, treatmentSucceeded: true });
        expect(tick).toEqual({ damage: 0, cumulative: 6 });
    });
});

describe('isTreatmentComplete (#123)', () => {
    it('false below the threshold', () => {
        expect(isTreatmentComplete(plague, 0)).toBe(false);
        expect(isTreatmentComplete(plague, 5)).toBe(false);
    });
    it('true at or above the threshold', () => {
        expect(isTreatmentComplete(plague, 6)).toBe(true);
        expect(isTreatmentComplete(plague, 12)).toBe(true);
    });
});
