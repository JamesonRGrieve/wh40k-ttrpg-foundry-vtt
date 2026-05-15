/**
 * Extended Test state container (core.md §"Extended Tests").
 *
 * Tracks cumulative DoS toward a threshold over multiple attempts,
 * plus a fail counter to short-circuit on too many failures. Lives on
 * the chat-card level — one instance per ongoing test — and is
 * consulted by the unified roll dialog when the player flags the test
 * as Extended.
 *
 * Time-per-attempt is informational: the GM decides how long each
 * attempt takes; this class only tracks the test ladder.
 */
export class ExtendedTestData {
    /** Total DoS the test must accumulate to succeed. */
    threshold: number;

    /** DoS accumulated so far. */
    accumulatedDoS: number = 0;

    /** Successful attempts so far (counter, not used for math; for chat). */
    successes: number = 0;

    /** Failed attempts so far. */
    failures: number = 0;

    /**
     * Maximum failed attempts allowed before the test is considered
     * blown. 0 disables the limit (some Extended Tests are open-ended).
     */
    failureBudget: number = 0;

    /** Human-readable description of one attempt's time cost. Optional. */
    timePerAttempt: string = '';

    /** Optional canonical skill / characteristic this test exercises. */
    rollKey: string = '';

    constructor(opts: { threshold: number; failureBudget?: number; timePerAttempt?: string; rollKey?: string }) {
        this.threshold = Math.max(1, Math.trunc(opts.threshold));
        if (opts.failureBudget !== undefined) this.failureBudget = Math.max(0, Math.trunc(opts.failureBudget));
        if (opts.timePerAttempt !== undefined) this.timePerAttempt = opts.timePerAttempt;
        if (opts.rollKey !== undefined) this.rollKey = opts.rollKey;
    }

    /** Record an attempt's outcome. Pass a positive DoS for success, 0 (or omit) for failure. */
    recordAttempt(dos: number): void {
        const value = Number.isFinite(dos) ? Math.trunc(dos) : 0;
        if (value > 0) {
            this.accumulatedDoS += value;
            this.successes += 1;
        } else {
            this.failures += 1;
        }
    }

    /** True once `accumulatedDoS >= threshold`. */
    get isComplete(): boolean {
        return this.accumulatedDoS >= this.threshold;
    }

    /** True once `failures >= failureBudget`, if a budget is set. */
    get isFailed(): boolean {
        return this.failureBudget > 0 && this.failures >= this.failureBudget;
    }

    /** Remaining DoS to complete. Never negative. */
    get remaining(): number {
        return Math.max(0, this.threshold - this.accumulatedDoS);
    }
}
