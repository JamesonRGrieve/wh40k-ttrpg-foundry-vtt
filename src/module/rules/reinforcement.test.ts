import { describe, expect, it } from 'vitest';
import { getReinforcementCallTarget, isReinforcementTier, REINFORCEMENT_MODIFIER } from './reinforcement';

describe('REINFORCEMENT_MODIFIER', () => {
    it('has the four canonical tiers', () => {
        expect(Object.keys(REINFORCEMENT_MODIFIER)).toEqual(['standard', 'specialist', 'elite', 'master']);
    });
    it('escalates from 0 to −30 by 10s', () => {
        expect(REINFORCEMENT_MODIFIER.standard).toBe(0);
        expect(REINFORCEMENT_MODIFIER.specialist).toBe(-10);
        expect(REINFORCEMENT_MODIFIER.elite).toBe(-20);
        expect(REINFORCEMENT_MODIFIER.master).toBe(-30);
    });
});

describe('isReinforcementTier', () => {
    it('accepts the four canonical tiers', () => {
        for (const t of ['standard', 'specialist', 'elite', 'master']) {
            expect(isReinforcementTier(t)).toBe(true);
        }
    });
    it('rejects unknown tier strings', () => {
        expect(isReinforcementTier('apprentice')).toBe(false);
        expect(isReinforcementTier('')).toBe(false);
        expect(isReinforcementTier(null)).toBe(false);
    });
});

describe('getReinforcementCallTarget', () => {
    it('returns influence unmodified for standard tier', () => {
        expect(getReinforcementCallTarget(40, 'standard')).toBe(40);
    });
    it('applies the tier modifier', () => {
        expect(getReinforcementCallTarget(40, 'specialist')).toBe(30);
        expect(getReinforcementCallTarget(40, 'master')).toBe(10);
    });
    it('clamps at 0', () => {
        expect(getReinforcementCallTarget(10, 'master')).toBe(0);
    });
});
