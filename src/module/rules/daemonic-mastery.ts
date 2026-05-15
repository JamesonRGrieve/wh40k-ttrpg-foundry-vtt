/**
 * Daemonic Mastery test framework (beyond.md p. 59).
 *
 * Daemonic Mastery is an opposed Willpower test at Very Hard (−30)
 * baseline, modified by True Name, ritual components, binding strength,
 * and GM-supplied factors. Used by Summoning, Binding, Exorcism, and
 * Daemonhost creation.
 *
 * The composition function returns the modified target plus a per-
 * modifier breakdown for chat-card display.
 */

export interface DaemonicMasteryFactor {
    label: string;
    /** Positive helps the player; negative hinders. */
    modifier: number;
}

/** Canonical factor labels from beyond.md p. 59. */
export const DAEMONIC_MASTERY_FACTORS = {
    BASE_DIFFICULTY: { label: 'Daemonic Mastery (base Very Hard)', modifier: -30 },
    TRUE_NAME: { label: 'True Name', modifier: 30 },
    PROPER_COMPONENTS: { label: 'Proper Ritual Components', modifier: 10 },
    MISSING_COMPONENTS: { label: 'Missing Ritual Components', modifier: -20 },
    CONSECRATED_GROUND: { label: 'Consecrated Ground', modifier: 10 },
    UNCONSECRATED_PLACE: { label: 'Defiled Ground', modifier: -10 },
} satisfies Record<string, DaemonicMasteryFactor>;

export interface DaemonicMasteryInput {
    willpowerTotal: number;
    factors: DaemonicMasteryFactor[];
}

export interface DaemonicMasteryResult {
    target: number;
    breakdown: { label: string; value: number }[];
}

export function buildDaemonicMasteryTest(input: DaemonicMasteryInput): DaemonicMasteryResult {
    const breakdown: { label: string; value: number }[] = [];
    breakdown.push({ label: 'Willpower', value: Math.max(0, Math.trunc(input.willpowerTotal)) });
    for (const factor of input.factors) {
        if (factor.modifier !== 0) breakdown.push({ label: factor.label, value: factor.modifier });
    }
    const target = Math.max(
        0,
        breakdown.reduce((sum, m) => sum + m.value, 0),
    );
    return { target, breakdown };
}
