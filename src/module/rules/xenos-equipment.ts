/**
 * Modifying / Repairing Xenos Equipment (#136 — without.md L1145-1490).
 *
 * Xenos items degrade with use; refit requires a Tech-Use test modified
 * by the item's Availability. This module exposes:
 *  - The condition ladder (pristine → worn → degraded → ruined).
 *  - A degradation-tick helper for use-counter hooks.
 *  - A Tech-Use repair-target composer that consumes the Availability
 *    modifier per RAW.
 *
 * Item schema field for degradation, the on-fire decrement hook, and
 * the sheet surface remain follow-ups under #136.
 */

import { AVAILABILITY_MODIFIERS, type AvailabilityKey } from './requisition-test.ts';

export type XenosCondition = 'pristine' | 'worn' | 'degraded' | 'ruined';

const CONDITION_LADDER: readonly XenosCondition[] = ['pristine', 'worn', 'degraded', 'ruined'];

/** Charges-remaining threshold at which the item drops to the next condition. */
export const XENOS_CONDITION_THRESHOLDS: Record<XenosCondition, { minCharges: number }> = {
    pristine: { minCharges: 8 },
    worn: { minCharges: 4 },
    degraded: { minCharges: 1 },
    ruined: { minCharges: 0 },
};

/**
 * Map a remaining-charge count to the canonical condition tier.
 * Returns `'ruined'` for any non-positive charge count.
 */
export function getXenosCondition(remainingCharges: number): XenosCondition {
    const n = Number.isFinite(remainingCharges) ? Math.trunc(remainingCharges) : 0;
    if (n >= XENOS_CONDITION_THRESHOLDS.pristine.minCharges) return 'pristine';
    if (n >= XENOS_CONDITION_THRESHOLDS.worn.minCharges) return 'worn';
    if (n >= XENOS_CONDITION_THRESHOLDS.degraded.minCharges) return 'degraded';
    return 'ruined';
}

/**
 * Decrement a use-counter and report the new condition. The caller
 * persists the new charge count via the item document; this helper is
 * a pure projection.
 */
export function tickXenosDegradation(remainingCharges: number, ticks = 1): { newCharges: number; newCondition: XenosCondition } {
    const start = Math.max(0, Math.trunc(remainingCharges));
    const decrement = Math.max(0, Math.trunc(ticks));
    const newCharges = Math.max(0, start - decrement);
    return { newCharges, newCondition: getXenosCondition(newCharges) };
}

/**
 * The repair Tech-Use target uses the same Availability modifier as
 * the canonical acquisition test (`requisition-test.ts:AVAILABILITY_MODIFIERS`).
 * Re-exported here under a descriptive alias for downstream readers.
 */
export { AVAILABILITY_MODIFIERS as AVAILABILITY_REPAIR_MODIFIER } from './requisition-test.ts';

export interface XenosRepairInput {
    /** Actor's Tech-Use skill total. */
    techUseTotal: number;
    /** Item's Availability key. */
    availability: AvailabilityKey;
    /** Current condition (worn / degraded / ruined repairable; pristine is no-op). */
    currentCondition: XenosCondition;
}

export interface XenosRepairResult {
    /** Effective Tech-Use target for the repair test. */
    target: number;
    /** True when the item is in pristine condition (no repair needed). */
    isNoOp: boolean;
    /** True when the item is ruined beyond field repair (RAW: requires Forge-world facility). */
    requiresFacility: boolean;
}

/** Compose the Tech-Use target for a field repair attempt. */
export function resolveXenosRepairTarget(input: XenosRepairInput): XenosRepairResult {
    if (input.currentCondition === 'pristine') {
        return { target: input.techUseTotal, isNoOp: true, requiresFacility: false };
    }
    const tu = Math.max(0, Math.trunc(input.techUseTotal));
    const modifier = AVAILABILITY_MODIFIERS[input.availability] ?? 0;
    const target = Math.max(0, tu + modifier);
    return {
        target,
        isNoOp: false,
        requiresFacility: input.currentCondition === 'ruined',
    };
}

/** Repairing one tier up the ladder (worn → pristine, degraded → worn, etc.). */
export function nextConditionUp(current: XenosCondition): XenosCondition {
    const idx = CONDITION_LADDER.indexOf(current);
    if (idx <= 0) return current;
    const better = CONDITION_LADDER[idx - 1];
    return better ?? current;
}
