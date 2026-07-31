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

    /**
     * Plain, JSON-safe snapshot for persistence.
     *
     * An Extended Test spans several rolls by definition — "progress carries
     * over between rolls instead of each attempt standing alone" — so the
     * ladder cannot live only in dialog memory, which dies with the dialog.
     * The caller stores this on the actor and rehydrates via {@link fromState}.
     */
    toState(): ExtendedTestState {
        return {
            threshold: this.threshold,
            accumulatedDoS: this.accumulatedDoS,
            successes: this.successes,
            failures: this.failures,
            failureBudget: this.failureBudget,
            timePerAttempt: this.timePerAttempt,
            rollKey: this.rollKey,
        };
    }

    /**
     * Rebuild a ladder from a persisted snapshot. Missing or malformed fields
     * fall back to a fresh ladder's defaults rather than throwing, so a flag
     * written by an older version (or hand-edited) degrades to a usable test
     * instead of breaking the roll.
     */
    static fromState(state: Partial<ExtendedTestState> | null | undefined): ExtendedTestData {
        const src = state ?? {};
        const test = new ExtendedTestData({
            threshold: typeof src.threshold === 'number' ? src.threshold : 1,
            failureBudget: typeof src.failureBudget === 'number' ? src.failureBudget : 0,
            timePerAttempt: typeof src.timePerAttempt === 'string' ? src.timePerAttempt : '',
            rollKey: typeof src.rollKey === 'string' ? src.rollKey : '',
        });
        const restore = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0);
        test.accumulatedDoS = restore(src.accumulatedDoS);
        test.successes = restore(src.successes);
        test.failures = restore(src.failures);
        return test;
    }

    /**
     * Flattened context for `chat/partial/extended-test-progress.hbs`.
     *
     * The partial reads `isComplete` / `isFailed` / `remaining`, which are
     * prototype GETTERS — they are not own enumerable properties, so they do
     * not survive the instance-flattening the chat pipeline performs. Spelling
     * them out here is what makes the progress bar and the completion banner
     * render at all.
     */
    toChatContext(): ExtendedTestChatContext {
        return {
            ...this.toState(),
            isComplete: this.isComplete,
            isFailed: this.isFailed,
            remaining: this.remaining,
        };
    }
}

/**
 * Ladder as `chat/partial/extended-test-progress.hbs` consumes it — the persisted
 * state plus the three derived values that are prototype getters on the class and
 * therefore do not survive instance flattening.
 */
export type ExtendedTestChatContext = ExtendedTestState & { isComplete: boolean; isFailed: boolean; remaining: number };

/** JSON-safe persisted shape of an {@link ExtendedTestData} ladder. */
export interface ExtendedTestState {
    threshold: number;
    accumulatedDoS: number;
    successes: number;
    failures: number;
    failureBudget: number;
    timePerAttempt: string;
    rollKey: string;
}

/** One resolved attempt, as the roll pipeline knows it. */
export interface ExtendedTestAttempt {
    /** The ladder's target, as currently set on the dialog. */
    threshold: number;
    /** Whether the roll succeeded. A failure records `dos: 0` regardless of the value passed. */
    success: boolean;
    /** Degrees of success on a successful roll. */
    dos: number;
    /** Roll key the test exercises; stamped onto the ladder for display. */
    rollKey: string;
}

/** What the caller must do with the ladder after an attempt resolves. */
export interface ExtendedTestOutcome {
    /** State to persist, or `null` when the ladder is finished and should be cleared. */
    nextState: ExtendedTestState | null;
    /** Flattened ladder for the chat partial — always present, including on the final attempt. */
    chatContext: ExtendedTestState & { isComplete: boolean; isFailed: boolean; remaining: number };
    /** True when this attempt reached the threshold. */
    isComplete: boolean;
    /** True when this attempt blew the failure budget. */
    isFailed: boolean;
}

/**
 * Apply one resolved attempt to a (possibly absent) persisted ladder.
 *
 * Pure: the caller owns loading and storing the state. This lives here rather than
 * in the roll dialog because it is rules arithmetic, and sheets/dialogs are UI
 * shells — the same 3-layer split every other mechanic follows.
 *
 * A finished ladder returns `nextState: null` so the caller CLEARS it: the next
 * Extended Test on that key starts fresh instead of resuming a completed one. The
 * chat context is still returned for the attempt that ended it, so the card can
 * show the final state.
 *
 * A mid-test threshold change is honoured and accumulated progress is preserved —
 * a GM raising or lowering the bar should not discard the attempts already made.
 */
export function advanceExtendedTest(persisted: Partial<ExtendedTestState> | null | undefined, attempt: ExtendedTestAttempt): ExtendedTestOutcome {
    const ladder = ExtendedTestData.fromState(persisted);
    ladder.rollKey = attempt.rollKey;
    ladder.threshold = Math.max(1, Math.trunc(attempt.threshold));
    ladder.recordAttempt(attempt.success ? attempt.dos : 0);

    const finished = ladder.isComplete || ladder.isFailed;
    return {
        nextState: finished ? null : ladder.toState(),
        chatContext: ladder.toChatContext(),
        isComplete: ladder.isComplete,
        isFailed: ladder.isFailed,
    };
}
