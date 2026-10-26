/**
 * The origin-path builder footer's step progress (#701), counted over the same
 * steps the stepper draws, so the two can never disagree. The footer counted the
 * core steps, the optional step and Characteristics but not Equipment, reading
 * "0/5 steps" beside a six-step stepper.
 */

/** A stepper step, as far as the progress count reads it. */
export interface ProgressStep {
    isComplete: boolean;
}

/** Steps done and steps in all, over the stepper's own list. */
export function stepProgress(steps: readonly ProgressStep[]): { done: number; total: number } {
    return { done: steps.filter((step) => step.isComplete).length, total: steps.length };
}
