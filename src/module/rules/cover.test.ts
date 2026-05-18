import { describe, expect, it } from 'vitest';
import { COVER_AP, COVER_LABELS, resolveCoverHit, startingCoverAP } from './cover';

describe('COVER_AP table (#110, Table 7-4 p.229)', () => {
    it('thin metal = 4', () => {
        expect(COVER_AP['thin-metal']).toBe(4);
    });
    it('sandbags = 8', () => {
        expect(COVER_AP.sandbags).toBe(8);
    });
    it('barricade = 12', () => {
        expect(COVER_AP.barricade).toBe(12);
    });
    it('rockcrete = 16', () => {
        expect(COVER_AP.rockcrete).toBe(16);
    });
    it('plasteel = 32', () => {
        expect(COVER_AP.plasteel).toBe(32);
    });

    it('every type has a matching label', () => {
        for (const key of Object.keys(COVER_AP)) {
            expect(COVER_LABELS[key as keyof typeof COVER_LABELS]).toBeDefined();
        }
    });
});

describe('resolveCoverHit (#110)', () => {
    it('cover fully absorbs when incomingDamage ≤ coverAP', () => {
        const r = resolveCoverHit({ incomingDamage: 5, coverAP: 8 });
        expect(r.coverAbsorbed).toBe(5);
        expect(r.overflowToActor).toBe(0);
        expect(r.remainingCoverAP).toBe(3);
        expect(r.coverDestroyed).toBe(false);
    });

    it('cover destroyed when damage exactly equals AP — overflow 0', () => {
        const r = resolveCoverHit({ incomingDamage: 4, coverAP: 4 });
        expect(r.coverAbsorbed).toBe(4);
        expect(r.overflowToActor).toBe(0);
        expect(r.remainingCoverAP).toBe(0);
        expect(r.coverDestroyed).toBe(true);
    });

    it('overflow passes through to actor when damage > AP', () => {
        const r = resolveCoverHit({ incomingDamage: 10, coverAP: 4 });
        expect(r.coverAbsorbed).toBe(4);
        expect(r.overflowToActor).toBe(6);
        expect(r.remainingCoverAP).toBe(0);
        expect(r.coverDestroyed).toBe(true);
    });

    it('zero-damage hit does not destroy zero-AP cover', () => {
        const r = resolveCoverHit({ incomingDamage: 0, coverAP: 0 });
        expect(r.coverAbsorbed).toBe(0);
        expect(r.overflowToActor).toBe(0);
        expect(r.coverDestroyed).toBe(false);
    });

    it('handles non-finite damage as 0', () => {
        const r = resolveCoverHit({ incomingDamage: Number.NaN, coverAP: 8 });
        expect(r.coverAbsorbed).toBe(0);
        expect(r.overflowToActor).toBe(0);
        expect(r.remainingCoverAP).toBe(8);
    });
});

describe('startingCoverAP (#110)', () => {
    it('returns the table value for each cover type', () => {
        expect(startingCoverAP('thin-metal')).toBe(4);
        expect(startingCoverAP('plasteel')).toBe(32);
    });
});
