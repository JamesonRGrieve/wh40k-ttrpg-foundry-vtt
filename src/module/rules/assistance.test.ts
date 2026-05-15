import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_CAP, getAssistanceBonus } from './assistance';

describe('getAssistanceBonus', () => {
    it('returns 0 for no assistants', () => {
        expect(getAssistanceBonus(0)).toBe(0);
    });
    it('returns +10 per assistant up to the cap', () => {
        expect(getAssistanceBonus(1)).toBe(10);
        expect(getAssistanceBonus(2)).toBe(20);
    });
    it('caps at the default two', () => {
        expect(DEFAULT_ASSISTANT_CAP).toBe(2);
        expect(getAssistanceBonus(3)).toBe(20);
        expect(getAssistanceBonus(99)).toBe(20);
    });
    it('honours an explicit cap override for group-effort scenarios', () => {
        expect(getAssistanceBonus(5, 5)).toBe(50);
        expect(getAssistanceBonus(7, 5)).toBe(50);
    });
    it('treats negative or non-finite counts as zero (with Infinity capped at the cap)', () => {
        expect(getAssistanceBonus(-3)).toBe(0);
        expect(getAssistanceBonus(NaN)).toBe(0);
        // Math.trunc(Infinity) is Infinity, but Math.min(Infinity, cap) returns cap.
        expect(getAssistanceBonus(Infinity)).toBe(0); // !isFinite short-circuits to 0
    });
});
