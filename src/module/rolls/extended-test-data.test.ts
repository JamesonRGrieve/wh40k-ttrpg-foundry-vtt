import { describe, expect, it } from 'vitest';
import { advanceExtendedTest, ExtendedTestData } from './extended-test-data';

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

describe('ExtendedTestData persistence', () => {
    it('round-trips accumulated progress through toState/fromState', () => {
        // The mechanic is defined across separate rolls, so the ladder has to survive
        // the dialog that created it. If this round-trip loses anything, every attempt
        // silently restarts from zero and the test can never complete.
        const original = new ExtendedTestData({ threshold: 12, failureBudget: 3, timePerAttempt: '1 hour', rollKey: 'techUse' });
        original.recordAttempt(4);
        original.recordAttempt(0);
        original.recordAttempt(2);

        const restored = ExtendedTestData.fromState(original.toState());

        expect(restored.toState()).toEqual(original.toState());
        expect(restored.accumulatedDoS).toBe(6);
        expect(restored.successes).toBe(2);
        expect(restored.failures).toBe(1);
        expect(restored.remaining).toBe(6);
    });

    it('continues accumulating after a rehydrate', () => {
        const first = new ExtendedTestData({ threshold: 5 });
        first.recordAttempt(3);

        const second = ExtendedTestData.fromState(first.toState());
        second.recordAttempt(2);

        expect(second.accumulatedDoS).toBe(5);
        expect(second.isComplete).toBe(true);
    });

    it('degrades a malformed or partial snapshot to usable defaults', () => {
        // A flag written by an older version, or hand-edited, must not break the roll.
        const restored = ExtendedTestData.fromState({ threshold: 4, accumulatedDoS: -3, successes: Number.NaN });

        expect(restored.threshold).toBe(4);
        expect(restored.accumulatedDoS).toBe(0);
        expect(restored.successes).toBe(0);
        expect(restored.failures).toBe(0);
    });

    it('treats a null snapshot as a fresh ladder', () => {
        const restored = ExtendedTestData.fromState(null);
        expect(restored.threshold).toBe(1);
        expect(restored.accumulatedDoS).toBe(0);
    });
});

describe('ExtendedTestData chat context', () => {
    it('materialises the getters the progress partial reads', () => {
        // `isComplete` / `isFailed` / `remaining` are prototype getters, so they are
        // NOT own enumerable properties and do not survive the chat pipeline's
        // instance flattening. Without this the partial renders no progress bar and
        // no completion banner — the exact reason it is a method rather than a spread.
        const t = new ExtendedTestData({ threshold: 4, failureBudget: 2, timePerAttempt: '10 minutes', rollKey: 'medicae' });
        t.recordAttempt(4);

        const ctx = t.toChatContext();

        expect(Object.keys(ctx)).toEqual(expect.arrayContaining(['isComplete', 'isFailed', 'remaining']));
        expect(ctx.isComplete).toBe(true);
        expect(ctx.remaining).toBe(0);
        expect(ctx.threshold).toBe(4);
        expect(ctx.timePerAttempt).toBe('10 minutes');

        // Spreading the instance is what a naive implementation would do; assert it
        // genuinely loses the getters, so this test cannot be "simplified" back into
        // the bug.
        expect(Object.keys({ ...t })).not.toContain('isComplete');
    });

    it('reports an in-progress ladder as neither complete nor failed', () => {
        const t = new ExtendedTestData({ threshold: 10, failureBudget: 3 });
        t.recordAttempt(2);
        const ctx = t.toChatContext();
        expect(ctx.isComplete).toBe(false);
        expect(ctx.isFailed).toBe(false);
        expect(ctx.remaining).toBe(8);
    });
});

describe('advanceExtendedTest', () => {
    const attempt = (over: Partial<Parameters<typeof advanceExtendedTest>[1]> = {}): Parameters<typeof advanceExtendedTest>[1] => ({
        threshold: 10,
        success: true,
        dos: 3,
        rollKey: 'techUse',
        ...over,
    });

    it('starts a ladder when nothing is persisted', () => {
        const out = advanceExtendedTest(null, attempt());
        expect(out.nextState?.accumulatedDoS).toBe(3);
        expect(out.nextState?.successes).toBe(1);
        expect(out.nextState?.rollKey).toBe('techUse');
        expect(out.isComplete).toBe(false);
    });

    it('accumulates onto a persisted ladder across attempts', () => {
        const first = advanceExtendedTest(null, attempt({ dos: 4 }));
        const second = advanceExtendedTest(first.nextState, attempt({ dos: 2 }));
        expect(second.nextState?.accumulatedDoS).toBe(6);
        expect(second.chatContext.remaining).toBe(4);
    });

    it('records a failed roll as a failure and adds no DoS', () => {
        // The roll pipeline can hand a stale `dos` on a failure; the outcome must
        // depend on `success`, not on the number that happens to ride along.
        const out = advanceExtendedTest(null, attempt({ success: false, dos: 5 }));
        expect(out.nextState?.accumulatedDoS).toBe(0);
        expect(out.nextState?.failures).toBe(1);
        expect(out.nextState?.successes).toBe(0);
    });

    it('clears the ladder once the threshold is reached', () => {
        // nextState null is the signal to UNSET the flag — otherwise a finished test
        // is resumed by the next attempt and can never be run again.
        const out = advanceExtendedTest(
            { threshold: 5, accumulatedDoS: 4, successes: 1, failures: 0, failureBudget: 0, timePerAttempt: '', rollKey: 'techUse' },
            attempt({ threshold: 5, dos: 1 }),
        );
        expect(out.isComplete).toBe(true);
        expect(out.nextState).toBeNull();
        // The card still shows the attempt that finished it.
        expect(out.chatContext.isComplete).toBe(true);
        expect(out.chatContext.accumulatedDoS).toBe(5);
    });

    it('clears the ladder once the failure budget is blown', () => {
        const out = advanceExtendedTest(
            { threshold: 20, accumulatedDoS: 1, successes: 1, failures: 2, failureBudget: 3, timePerAttempt: '', rollKey: 'techUse' },
            attempt({ threshold: 20, success: false, dos: 0 }),
        );
        expect(out.isFailed).toBe(true);
        expect(out.nextState).toBeNull();
        expect(out.chatContext.isFailed).toBe(true);
    });

    it('honours a mid-test threshold change without discarding progress', () => {
        const out = advanceExtendedTest(
            { threshold: 20, accumulatedDoS: 6, successes: 2, failures: 0, failureBudget: 0, timePerAttempt: '', rollKey: 'techUse' },
            attempt({ threshold: 12, dos: 1 }),
        );
        expect(out.nextState?.threshold).toBe(12);
        expect(out.nextState?.accumulatedDoS).toBe(7);
    });
});
