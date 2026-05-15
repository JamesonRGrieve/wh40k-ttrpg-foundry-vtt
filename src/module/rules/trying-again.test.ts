import { describe, expect, it } from 'vitest';
import { CUMULATIVE_PENALTY_SKILLS, getTryAgainAdvice, NO_RETRY_SKILLS } from './trying-again';

describe('getTryAgainAdvice', () => {
    it('returns no advice on the first attempt', () => {
        const advice = getTryAgainAdvice('inquiry', 0);
        expect(advice.blocksByConvention).toBe(false);
        expect(advice.cumulativePenalty).toBe(0);
        expect(advice.hint).toBe('');
    });

    it('flags no-retry skills on the second attempt', () => {
        const advice = getTryAgainAdvice('inquiry', 1);
        expect(advice.blocksByConvention).toBe(true);
        expect(advice.cumulativePenalty).toBe(0);
        expect(advice.hint).toContain('cannot be retried');
    });

    it('applies cumulative −10 per retry on social skills', () => {
        expect(getTryAgainAdvice('charm', 1).cumulativePenalty).toBe(-10);
        expect(getTryAgainAdvice('charm', 2).cumulativePenalty).toBe(-20);
        expect(getTryAgainAdvice('intimidate', 3).cumulativePenalty).toBe(-30);
    });

    it('does not flag skills outside either set', () => {
        const advice = getTryAgainAdvice('weaponSkill', 5);
        expect(advice.blocksByConvention).toBe(false);
        expect(advice.cumulativePenalty).toBe(0);
        expect(advice.hint).toBe('');
    });

    it('treats negative previousAttempts as zero', () => {
        const advice = getTryAgainAdvice('charm', -3);
        expect(advice.cumulativePenalty).toBe(0);
    });

    it('exposes the canonical no-retry and cumulative-penalty skill sets', () => {
        expect(NO_RETRY_SKILLS.has('inquiry')).toBe(true);
        expect(CUMULATIVE_PENALTY_SKILLS.has('charm')).toBe(true);
    });
});
