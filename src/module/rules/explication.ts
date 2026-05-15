/**
 * Explication research engine (without.md p. 65-69).
 *
 * Five Objectives the warband may pursue per xenos target:
 *   - Eradication (combat advantage)
 *   - Aegis (defensive)
 *   - Detection (locate)
 *   - Communication (negotiate)
 *   - Comprehension (lore mastery)
 *
 * Each Objective scales by complexity tier; intermediate progress
 * yields Breakthroughs. Sits atop #59's ExtendedTestData ladder for
 * the cumulative-DoS accumulation.
 */

export type ExplicationObjective = 'eradication' | 'aegis' | 'detection' | 'communication' | 'comprehension';

export const EXPLICATION_THRESHOLDS: Record<'minor' | 'standard' | 'major' | 'grand', number> = {
    minor: 10,
    standard: 25,
    major: 50,
    grand: 100,
};

/** Breakthrough milestones — fractional thresholds emit intermediate revelations. */
export const BREAKTHROUGH_FRACTIONS: readonly number[] = [0.25, 0.5, 0.75];

export interface ExplicationState {
    target: string;
    objective: ExplicationObjective;
    complexity: keyof typeof EXPLICATION_THRESHOLDS;
    accumulatedDoS: number;
}

/** Count breakthroughs crossed by a DoS movement. */
export function breakthroughsCrossed(state: { complexity: keyof typeof EXPLICATION_THRESHOLDS; oldDoS: number; newDoS: number }): number {
    const total = EXPLICATION_THRESHOLDS[state.complexity];
    const a = state.oldDoS / total;
    const b = state.newDoS / total;
    if (b <= a) return 0;
    let crossed = 0;
    for (const frac of BREAKTHROUGH_FRACTIONS) {
        if (a < frac && b >= frac) crossed += 1;
    }
    return crossed;
}

/** True once the Objective's threshold is met. */
export function isExplicationComplete(state: ExplicationState): boolean {
    return state.accumulatedDoS >= EXPLICATION_THRESHOLDS[state.complexity];
}
