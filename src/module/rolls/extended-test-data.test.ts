import { describe, expect, it } from 'vitest';
import { ExtendedTestData } from './extended-test-data';

describe('ExtendedTestData', () => {
    it('clamps the threshold to a minimum of 1', () => {
        const t = new ExtendedTestData({ threshold: 0 });
        expect(t.threshold).toBe(1);
    });

    it('accumulates DoS across multiple successful attempts', () => {
        const t = new ExtendedTestData({ threshold: 10 });
        t.recordAttempt(3);
        t.recordAttempt(2);
        t.recordAttempt(4);
        expect(t.accumulatedDoS).toBe(9);
        expect(t.successes).toBe(3);
        expect(t.failures).toBe(0);
        expect(t.isComplete).toBe(false);
        expect(t.remaining).toBe(1);
    });

    it('flips to complete when accumulated >= threshold', () => {
        const t = new ExtendedTestData({ threshold: 5 });
        t.recordAttempt(2);
        t.recordAttempt(3);
        expect(t.isComplete).toBe(true);
        expect(t.remaining).toBe(0);
    });

    it('counts a 0-DoS (or negative) attempt as a failure', () => {
        const t = new ExtendedTestData({ threshold: 5 });
        t.recordAttempt(0);
        t.recordAttempt(-2);
        expect(t.failures).toBe(2);
        expect(t.accumulatedDoS).toBe(0);
        expect(t.successes).toBe(0);
    });

    it('respects a failure budget and flips to failed when exceeded', () => {
        const t = new ExtendedTestData({ threshold: 10, failureBudget: 2 });
        t.recordAttempt(0);
        expect(t.isFailed).toBe(false);
        t.recordAttempt(0);
        expect(t.isFailed).toBe(true);
    });

    it('failureBudget of 0 disables the failure check', () => {
        const t = new ExtendedTestData({ threshold: 10 });
        for (let i = 0; i < 100; i++) t.recordAttempt(0);
        expect(t.isFailed).toBe(false);
    });
});
