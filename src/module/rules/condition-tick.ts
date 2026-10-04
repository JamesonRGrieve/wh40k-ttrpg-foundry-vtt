/**
 * Data-driven condition ticks — the pure half of the per-interval condition
 * processor (Fire, Blood Loss, Suffocation, …).
 *
 * Each condition document declares its `system.tick` (interval, damage formula,
 * damage type, armour bypass, fatigue, an optional test and the condition applied
 * when it fails; Direction #7). The combat turn hook resolves the bearer's active
 * conditions and hands them here: this module decides WHICH ticks fire and what
 * a tick's test resolves to. The impure half — rolling, the chat card, applying an
 * `onFail` condition — lives in `rules/active-effects.ts` `processConditionTicks`.
 * Nothing here names a condition.
 */

import { isD100Success } from './_dice.ts';
import type { ConditionMechanics, ConditionTick, ConditionTickTest, TickInterval } from './condition-mechanics.ts';

/**
 * Intervals processed at the start of the bearer's combat turn. The bearer takes
 * exactly one turn per round, so a once-per-round tick and a once-per-turn tick
 * both land on its turn start — which is when the system has always processed
 * Fire and Blood Loss. `minute` ticks run on a world-time scale the combat turn
 * hook does not drive.
 */
const TURN_START_INTERVALS: ReadonlySet<TickInterval> = new Set<TickInterval>(['round', 'turn']);

/** True when a tick has anything to resolve (damage, fatigue or a test). */
export function tickHasEffect(tick: ConditionTick): boolean {
    return tick.damage !== '' || tick.fatigue > 0 || tick.test !== null;
}

/**
 * The conditions whose tick fires at the start of the bearer's combat turn.
 * @param {readonly ConditionMechanics[]} mechanics  The bearer's active conditions.
 * @returns {ConditionMechanics[]}  The ticking conditions, in input order.
 */
export function ticksDueAtTurnStart(mechanics: readonly ConditionMechanics[]): ConditionMechanics[] {
    return mechanics.filter((entry) => TURN_START_INTERVALS.has(entry.tick.interval) && tickHasEffect(entry.tick));
}

/** A resolved tick test. */
export interface TickTestOutcome {
    /** The modified target (characteristic total + difficulty). */
    target: number;
    success: boolean;
}

/**
 * Resolve a tick's test against the bearer's characteristic.
 * @param {ConditionTickTest} test  The tick's declared test.
 * @param {number} characteristicTotal  The bearer's total in `test.characteristic`.
 * @param {number} rollTotal  The d100 result.
 * @returns {TickTestOutcome}  The target and whether the test passed.
 */
export function resolveTickTest(test: ConditionTickTest, characteristicTotal: number, rollTotal: number): TickTestOutcome {
    const target = characteristicTotal + test.difficulty;
    return { target, success: isD100Success(rollTotal, target) };
}

/**
 * The condition a failed tick test applies, or null when the test passed, the
 * tick declares no `onFail`, or the bearer already carries it.
 * @param {ConditionTick} tick  The tick.
 * @param {boolean} passed  Whether its test passed.
 * @param {ReadonlySet<string>} activeIdentifiers  The bearer's current condition identifiers.
 * @returns {string | null}  The identifier to apply.
 */
export function tickFailureCondition(tick: ConditionTick, passed: boolean, activeIdentifiers: ReadonlySet<string>): string | null {
    if (passed || tick.onFail === '' || activeIdentifiers.has(tick.onFail)) return null;
    return tick.onFail;
}
