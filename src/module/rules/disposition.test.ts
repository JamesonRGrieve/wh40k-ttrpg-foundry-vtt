import { describe, expect, it } from 'vitest';
import { DISPOSITION_LABELS, getDispositionModifier, labelForDisposition } from './disposition';

describe('labelForDisposition', () => {
    it('maps -3 to Hostile, 0 to Neutral, +3 to Helpful', () => {
        expect(labelForDisposition(-3)).toBe('Hostile');
        expect(labelForDisposition(0)).toBe('Neutral');
        expect(labelForDisposition(3)).toBe('Helpful');
    });
    it('clamps out-of-range values to the extremes', () => {
        expect(labelForDisposition(-99)).toBe('Hostile');
        expect(labelForDisposition(99)).toBe('Helpful');
    });
    it('label list has the canonical 7 entries', () => {
        expect(DISPOSITION_LABELS.length).toBe(7);
    });
});

describe('getDispositionModifier', () => {
    it('Charm gets +10 per disposition step up', () => {
        expect(getDispositionModifier(2, 'charm')).toBe(20);
        expect(getDispositionModifier(-1, 'charm')).toBe(-10);
    });
    it('Intimidate inverts (friendly NPCs resist intimidation)', () => {
        expect(getDispositionModifier(2, 'intimidate')).toBe(-20);
        expect(getDispositionModifier(-3, 'intimidate')).toBe(30);
    });
    it('clamps the disposition input to −3..+3', () => {
        expect(getDispositionModifier(99, 'charm')).toBe(30);
        expect(getDispositionModifier(-99, 'charm')).toBe(-30);
    });
});
