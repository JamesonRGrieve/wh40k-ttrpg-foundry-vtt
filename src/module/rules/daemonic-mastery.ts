/**
 * Daemonic Mastery test framework (a DH2 supplement).
 *
 * A Daemonic Mastery test is an opposed Willpower test against the Daemon at a
 * Very Hard (−30) base difficulty. Printed modifiers: +10 when the summoner
 * serves the Daemon's patron Chaos God, +30 when the Daemon's True Name is
 * known, and −30 for a further test made because the Daemon is ordered to act
 * against its nature. Anything else is a GM circumstance factor. Used by
 * Summoning (`summoning-ritual.ts`) and Exorcism (`exorcism.ts`).
 *
 * Composition returns the base value plus one provenance row per non-zero
 * factor, summed and ±60-capped through the roll SSOT (`aggregate-target.ts`),
 * so the chat card prints the full formula with each component's source.
 */

import { aggregateModifierTotal } from '../rolls/aggregate-target.ts';
import { nonNegInt } from './_num.ts';

/** One modifier on a ritual test. `labelKey` is a langpack key; `label` overrides it for GM free-text rows. */
export interface DaemonicMasteryFactor {
    /** Stable id — the provenance source of the row. */
    readonly id: string;
    /** Langpack key naming the factor. */
    readonly labelKey: string;
    /** Positive helps the tester; negative hinders. */
    readonly modifier: number;
    /** GM-authored label shown instead of `labelKey` (free-text circumstance rows). */
    readonly label?: string;
}

/** Printed Daemonic Mastery factors. */
export const DAEMONIC_MASTERY_FACTORS = {
    BASE_DIFFICULTY: { id: 'base-difficulty', labelKey: 'WH40K.Daemonology.Factor.MasteryBase', modifier: -30 },
    TRUE_NAME: { id: 'true-name', labelKey: 'WH40K.Daemonology.Factor.TrueName', modifier: 30 },
    PATRON_SERVANT: { id: 'patron-servant', labelKey: 'WH40K.Daemonology.Factor.PatronServant', modifier: 10 },
    AGAINST_NATURE: { id: 'against-nature', labelKey: 'WH40K.Daemonology.Factor.AgainstNature', modifier: -30 },
} as const satisfies Record<string, DaemonicMasteryFactor>;

/** One provenance-bearing component row of a composed ritual test. */
interface RitualTestComponent {
    readonly id: string;
    readonly labelKey: string;
    readonly label?: string;
    readonly value: number;
}

/** A composed d100 test: base, every component, the capped total and the target. */
export interface RitualTestComposition {
    readonly base: number;
    readonly components: readonly RitualTestComponent[];
    /** Un-capped modifier sum. */
    readonly rawModifierTotal: number;
    /** ±60-capped modifier sum the target uses. */
    readonly modifierTotal: number;
    /** True when the ±60 cap clamped the raw sum. */
    readonly capFired: boolean;
    /** Final target, floored at 0. */
    readonly target: number;
}

/**
 * Compose a ritual test from a base value and its factors. Zero-valued factors
 * are dropped (they change nothing and would only clutter the card).
 */
export function composeRitualTest(base: number, factors: readonly DaemonicMasteryFactor[]): RitualTestComposition {
    const components: RitualTestComponent[] = [];
    for (const factor of factors) {
        const value = Math.trunc(factor.modifier);
        if (value === 0 || !Number.isFinite(value)) continue;
        components.push({ id: factor.id, labelKey: factor.labelKey, value, ...(factor.label === undefined ? {} : { label: factor.label }) });
    }
    const record: Record<string, number> = {};
    components.forEach((component, index) => {
        record[`${index}:${component.id}`] = component.value;
    });
    const { total, raw, capFired } = aggregateModifierTotal(record);
    const safeBase = nonNegInt(base);
    return { base: safeBase, components, rawModifierTotal: raw, modifierTotal: total, capFired, target: Math.max(0, safeBase + total) };
}

export interface DaemonicMasteryInput {
    willpowerTotal: number;
    /** Factors beyond the always-present Very Hard base difficulty. */
    factors: readonly DaemonicMasteryFactor[];
}

/** Compose a Daemonic Mastery test: Willpower, the Very Hard base, then every supplied factor. */
export function buildDaemonicMasteryTest(input: DaemonicMasteryInput): RitualTestComposition {
    return composeRitualTest(input.willpowerTotal, [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY, ...input.factors]);
}

/** A GM circumstance factor from a free-text label and a value (the "other factors" every ritual allows). */
export function circumstanceFactor(id: string, label: string, modifier: number): DaemonicMasteryFactor {
    const trimmed = label.trim();
    return {
        id,
        labelKey: 'WH40K.Daemonology.Factor.Circumstance',
        modifier: Number.isFinite(modifier) ? Math.trunc(modifier) : 0,
        ...(trimmed === '' ? {} : { label: trimmed }),
    };
}
