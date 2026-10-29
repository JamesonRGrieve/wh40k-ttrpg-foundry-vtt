import { describe, expect, it } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { hireOutcome, serviceOffer, serviceOffers, serviceRequisition } from './service-hire.ts';

/**
 * Hiring a service reads every value off the service document: its availability
 * rating (through the line's ladder) and its `system.hire` threat / Subtlety.
 */

describe('serviceOffer', () => {
    it("projects the document's availability and hire data", () => {
        expect(serviceOffer({ uuid: 'u', name: 'A', system: { availability: 'very-rare', hire: { threatLevel: 3, subtlety: -3 } } })).toEqual({
            uuid: 'u',
            name: 'A',
            availability: 'veryRare',
            threatLevel: 3,
            subtlety: -3,
        });
    });

    it('treats absent hire data as no threat and no Subtlety change, and an unknown rating as none', () => {
        expect(serviceOffer({ uuid: 'u', name: 'A', system: { availability: 'nonsense' } })).toMatchObject({ availability: null, threatLevel: 0, subtlety: 0 });
    });

    it('lists offers by name', () => {
        const offers = serviceOffers([
            { uuid: '2', name: 'Beta', system: {} },
            { uuid: '1', name: 'Alpha', system: {} },
        ]);
        expect(offers.map((offer) => offer.name)).toEqual(['Alpha', 'Beta']);
    });
});

describe('serviceRequisition', () => {
    it("prices the test through the line's ladder from the document's availability", () => {
        const offer = serviceOffer({ uuid: 'u', name: 'A', system: { availability: 'scarce' } });
        const result = serviceRequisition(40, DH2_ACQUISITION_LADDER, offer);
        const breakdown = result?.kind === 'test' ? result.breakdown : [];
        const target = result?.kind === 'test' ? result.target : null;
        expect(result?.kind).toBe('test');
        expect(breakdown.map((component) => component.source)).toEqual(expect.arrayContaining(['rating', 'availability']));
        expect(target).toBe(breakdown.reduce((sum, component) => sum + component.value, 0));
    });

    it('is null when the document names no rating the ladder knows', () => {
        expect(serviceRequisition(40, DH2_ACQUISITION_LADDER, serviceOffer({ uuid: 'u', name: 'A', system: {} }))).toBeNull();
    });
});

describe('hireOutcome', () => {
    it('counts at least one degree on either side of the target', () => {
        expect(hireOutcome(30, 30)).toEqual({ success: true, dos: 1, dof: 0 });
        expect(hireOutcome(5, 30)).toEqual({ success: true, dos: 2, dof: 0 });
        expect(hireOutcome(31, 30)).toEqual({ success: false, dos: 0, dof: 1 });
        expect(hireOutcome(65, 30)).toEqual({ success: false, dos: 0, dof: 3 });
    });
});
