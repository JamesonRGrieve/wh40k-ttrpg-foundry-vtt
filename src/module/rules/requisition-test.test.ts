import { describe, expect, it } from 'vitest';
import { DH1eSystemConfig } from '../config/game-systems/dh1-config.ts';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { OW_ACQUISITION_LADDER } from '../config/game-systems/ow-config.ts';
import { getRequisitionTestTarget, type RequisitionTestInput } from './requisition-test';

/** The target of a test that resolves to a roll; fails loudly otherwise. */
function testTarget(input: RequisitionTestInput): number {
    const r = getRequisitionTestTarget(input);
    if (r.kind !== 'test') throw new Error(`expected a rolled test, got ${r.kind}`);
    return r.target;
}

const dh2 = DH2_ACQUISITION_LADDER;

describe('getRequisitionTestTarget — DH2 ladder (availability and craftsmanship tables)', () => {
    it('Common is Ordinary (+10): Influence 40 → 50', () => {
        expect(testTarget({ influence: 40, ladder: dh2, availability: 'common', craftsmanship: 'common' })).toBe(50);
    });

    it('Rare Best: 40 − 20 − 30 = −10, clamped to 0', () => {
        expect(testTarget({ influence: 40, ladder: dh2, availability: 'rare', craftsmanship: 'best' })).toBe(0);
    });

    it('Good craftsmanship is −20 on DH2 (not RT/BC −10)', () => {
        expect(testTarget({ influence: 50, ladder: dh2, availability: 'average', craftsmanship: 'good' })).toBe(30);
    });

    it('captures every modifier in the breakdown for chat-card display', () => {
        const r = getRequisitionTestTarget({ influence: 40, ladder: dh2, availability: 'rare', craftsmanship: 'best', extra: -10 });
        expect(r).toEqual({
            kind: 'test',
            target: 0,
            breakdown: [
                { source: 'rating', value: 40 },
                { source: 'availability', value: -20, detail: 'rare' },
                { source: 'craftsmanship', value: -30, detail: 'best' },
                { source: 'other', value: -10 },
            ],
        });
    });

    it('Ubiquitous is printed "Automatic": no roll, no target', () => {
        expect(getRequisitionTestTarget({ influence: 10, ladder: dh2, availability: 'ubiquitous' })).toEqual({ kind: 'automatic' });
    });
});

describe('getRequisitionTestTarget — other lines read their own ladder (#192)', () => {
    it('OW Unique is printed "GM\'s Discretion": no target can be derived', () => {
        expect(getRequisitionTestTarget({ influence: 50, ladder: OW_ACQUISITION_LADDER, availability: 'unique' })).toEqual({ kind: 'discretion' });
    });

    it('DH1 Influence requisition takes no craftsmanship modifier, so no craftsmanship row', () => {
        const r = getRequisitionTestTarget({ influence: 40, ladder: new DH1eSystemConfig().acquisitionLadder, availability: 'common', craftsmanship: 'best' });
        expect(r).toEqual({
            kind: 'test',
            target: 60,
            breakdown: [
                { source: 'rating', value: 40 },
                { source: 'availability', value: 20, detail: 'common' },
            ],
        });
    });
});
