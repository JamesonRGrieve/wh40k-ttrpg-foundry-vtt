/**
 * Exorcism ritual.
 *
 *   1. First, a Challenging (+0) Forbidden Lore (Daemonology) test: every
 *      degree of success adds +5 to the later Mastery tests.
 *   2. The exorcism is an Extended Daemonic Mastery test (Very Hard −30 base,
 *      Table 2–21 modifiers), each test taking 1d5 hours. The Daemon is cast out
 *      once the total degrees of success EXCEED the Daemon's Willpower bonus plus
 *      the possessed individual's Corruption bonus.
 *   3. Every failed test inflicts 1 Fatigue per degree of failure. If that
 *      knocks the exorcist unconscious he gains 1d10 Corruption and the
 *      exorcism fails.
 *   4. On success the possessed must pass a Challenging (+0) Toughness test or
 *      die (Fate may be burned to survive, as normal).
 *
 * Pure: the caller rolls the dice, drives {@link stepExorcism} until it
 * settles, and applies the results to the actors.
 */

import { nonNegInt } from './_num.ts';
import {
    buildDaemonicMasteryTest,
    composeRitualTest,
    DAEMONIC_MASTERY_FACTORS,
    type DaemonicMasteryFactor,
    type RitualTestComposition,
} from './daemonic-mastery.ts';
import { resolveTest, type TestOutcome } from './summoning-ritual.ts';

/** Table 2–21: Exorcism Modifiers (Enemies Beyond p. 71). The +5/DoS lore row is {@link loreBonusFactor}. */
export const EXORCISM_MODIFIERS = {
    SELF_EXORCISM: { id: 'self-exorcism', labelKey: 'WH40K.Daemonology.Factor.SelfExorcism', modifier: -10 },
    NO_PROPER_TOOLS: { id: 'no-proper-tools', labelKey: 'WH40K.Daemonology.Factor.NoProperTools', modifier: -10 },
    HIGHER_INFLUENCE: { id: 'higher-influence', labelKey: 'WH40K.Daemonology.Factor.HigherInfluence', modifier: -10 },
    WEAK_VEIL: { id: 'weak-veil', labelKey: 'WH40K.Daemonology.Factor.WeakVeil', modifier: -10 },
    SACRED_GROUND: { id: 'sacred-ground', labelKey: 'WH40K.Daemonology.Factor.SacredGround', modifier: 10 },
    PATRON_SERVANT: DAEMONIC_MASTERY_FACTORS.PATRON_SERVANT,
    TRUE_NAME: DAEMONIC_MASTERY_FACTORS.TRUE_NAME,
} as const satisfies Record<string, DaemonicMasteryFactor>;

/** Every Table 2–21 toggle, in printed order. */
export type ExorcismModifierId = keyof typeof EXORCISM_MODIFIERS;
export const EXORCISM_MODIFIER_ORDER: readonly ExorcismModifierId[] = [
    'SELF_EXORCISM',
    'NO_PROPER_TOOLS',
    'HIGHER_INFLUENCE',
    'WEAK_VEIL',
    'SACRED_GROUND',
    'PATRON_SERVANT',
    'TRUE_NAME',
];

/** Bonus per degree of success on the preparatory Forbidden Lore (Daemonology) test. */
const EXORCISM_LORE_BONUS_PER_DOS = 5;

/** The +5 per DoS row from the preparatory Forbidden Lore test. */
export function loreBonusFactor(loreDos: number): DaemonicMasteryFactor {
    return { id: 'lore-preparation', labelKey: 'WH40K.Daemonology.Factor.LorePreparation', modifier: nonNegInt(loreDos) * EXORCISM_LORE_BONUS_PER_DOS };
}

/** Challenging (+0) preparatory Forbidden Lore (Daemonology) test. */
export function prepareExorcismLoreTest(forbiddenLoreTotal: number): RitualTestComposition {
    return composeRitualTest(forbiddenLoreTotal, []);
}

/**
 * The degrees-of-success total the exorcist must EXCEED: Daemon Willpower bonus
 * plus the possessed individual's Corruption bonus.
 */
export function getExorcismThreshold(daemonWillpowerBonus: number, possessedCorruptionBonus: number): number {
    return nonNegInt(daemonWillpowerBonus) + nonNegInt(possessedCorruptionBonus);
}

/** Corruption bonus — the tens digit of a Corruption total. */
export function corruptionBonus(corruptionPoints: number): number {
    return Math.floor(nonNegInt(corruptionPoints) / 10);
}

export interface ExorcismAttemptInput {
    exorcistWillpower: number;
    /** Table 2–21 and GM factors for the attempts (not including the lore bonus). */
    factors: readonly DaemonicMasteryFactor[];
    /** Degrees of success on the preparatory Forbidden Lore test. */
    loreDos: number;
}

/** Compose the per-attempt Daemonic Mastery target (identical for every attempt). */
export function prepareExorcismAttempt(input: ExorcismAttemptInput): RitualTestComposition {
    return buildDaemonicMasteryTest({ willpowerTotal: input.exorcistWillpower, factors: [loreBonusFactor(input.loreDos), ...input.factors] });
}

/** One rolled attempt of the extended test. */
interface ExorcismAttempt extends TestOutcome {
    /** Hours this attempt took (1d5). */
    readonly hours: number;
    /** Fatigue suffered (= DoF on a failure). */
    readonly fatigue: number;
}

type ExorcismStatus = 'in-progress' | 'banished' | 'collapsed';

export interface ExorcismState {
    /** DoS total that must be exceeded. */
    readonly threshold: number;
    /** Per-attempt Mastery target. */
    readonly attemptTarget: number;
    /** Exorcist's Fatigue before the ritual. */
    readonly startingFatigue: number;
    /** Fatigue level the exorcist can carry before passing out (his threshold). */
    readonly fatigueThreshold: number;
    readonly attempts: readonly ExorcismAttempt[];
    readonly totalDos: number;
    readonly fatigueGained: number;
    readonly hours: number;
    readonly status: ExorcismStatus;
}

export function startExorcism(input: { threshold: number; attemptTarget: number; startingFatigue: number; fatigueThreshold: number }): ExorcismState {
    return {
        threshold: nonNegInt(input.threshold),
        attemptTarget: nonNegInt(input.attemptTarget),
        startingFatigue: nonNegInt(input.startingFatigue),
        fatigueThreshold: nonNegInt(input.fatigueThreshold),
        attempts: [],
        totalDos: 0,
        fatigueGained: 0,
        hours: 0,
        status: 'in-progress',
    };
}

/** Whether a total of degrees of success casts the Daemon out (strictly in excess of the threshold). */
export function isExorcismComplete(totalDos: number, threshold: number): boolean {
    return nonNegInt(totalDos) > nonNegInt(threshold);
}

/**
 * Apply one rolled attempt. Success adds its DoS; failure adds DoF Fatigue, and
 * Fatigue beyond the exorcist's threshold means unconsciousness — the exorcism
 * collapses. A settled state is returned unchanged.
 */
export function stepExorcism(state: ExorcismState, roll: number, hours: number): ExorcismState {
    if (state.status !== 'in-progress') return state;
    const outcome = resolveTest(roll, state.attemptTarget);
    const fatigue = outcome.success ? 0 : outcome.dof;
    const attempt: ExorcismAttempt = { ...outcome, hours: nonNegInt(hours), fatigue };
    const totalDos = state.totalDos + outcome.dos;
    const fatigueGained = state.fatigueGained + fatigue;
    let status: ExorcismStatus = 'in-progress';
    if (isExorcismComplete(totalDos, state.threshold)) status = 'banished';
    else if (state.startingFatigue + fatigueGained > state.fatigueThreshold) status = 'collapsed';
    return { ...state, attempts: [...state.attempts, attempt], totalDos, fatigueGained, hours: state.hours + attempt.hours, status };
}

/** Toughness target for the possessed to survive a successful exorcism: Challenging (+0). */
export function getHostSurvivalTarget(hostToughness: number): number {
    return nonNegInt(hostToughness);
}
