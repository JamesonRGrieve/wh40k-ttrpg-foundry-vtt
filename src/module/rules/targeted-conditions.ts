/**
 * Path B roll-time collector: modifiers the TARGET's active conditions impose on
 * whoever attacks it (Prone, Stunned, Surprised / Unaware, Grappled, Concealed, …).
 *
 * The values are authored on each condition document's `system.targeted` array
 * (Direction #7) and resolved for the target's game line; this collector only
 * filters them against the attack (melee / ranged, range band) and emits one
 * named, provenance-bearing component per contributing entry. It never names a
 * condition. The roll merges the components as ONE `target-conditions` bucket
 * whose sourced parts the chat card expands (see `RollData.expandedBuckets`), so
 * the aggregate flows through `aggregate-target.ts` with the ±60 cap like every
 * other modifier.
 */

import type { ConditionMechanics, TargetedConditionEntry } from './condition-mechanics.ts';
import { normalizeTag } from './situation-tags.ts';

/** The roll-modifier bucket key the components are summed under. */
export const TARGET_CONDITION_BUCKET = 'target-conditions';

/** The attack the collector filters entries against. */
export interface TargetedAttackContext {
    isMelee: boolean;
    isRanged: boolean;
    /**
     * The attack's range band, in any spelling `rules/range.ts` / `rangeBandOf`
     * produces (`pointBlank`, `point-blank`); undefined when no range was computed.
     */
    rangeBand: string | undefined;
}

/** One sourced contribution — structurally a `RollModifierComponent`. */
export interface TargetedConditionComponent {
    key: string;
    label: string;
    value: number;
    /** The condition imposing it (its display name). */
    source: string;
}

function entryAppliesToAttack(entry: TargetedConditionEntry, ctx: TargetedAttackContext): boolean {
    if (entry.attack === 'melee' && !ctx.isMelee) return false;
    if (entry.attack === 'ranged' && !ctx.isRanged) return false;
    if (entry.exceptRange !== '' && ctx.rangeBand !== undefined && normalizeTag(entry.exceptRange) === normalizeTag(ctx.rangeBand)) return false;
    return true;
}

/**
 * Collect the target-condition modifiers that apply to one attack.
 * @param {readonly ConditionMechanics[]} targetConditions  The TARGET's active conditions, line-resolved.
 * @param {TargetedAttackContext} ctx  The attack being made.
 * @returns {TargetedConditionComponent[]}  One component per applicable entry, in authored order.
 */
export function collectTargetedConditionModifiers(targetConditions: readonly ConditionMechanics[], ctx: TargetedAttackContext): TargetedConditionComponent[] {
    const components: TargetedConditionComponent[] = [];
    for (const condition of targetConditions) {
        condition.targeted.forEach((entry, index) => {
            if (!entryAppliesToAttack(entry, ctx)) return;
            components.push({
                key: `${TARGET_CONDITION_BUCKET}.${condition.identifier}.${index}`,
                label: entry.label !== '' ? entry.label : condition.name,
                value: entry.value,
                source: condition.name,
            });
        });
    }
    return components;
}

/** Sum of a component list (the bucket total the roll's modifier map carries). */
export function sumTargetedComponents(components: readonly TargetedConditionComponent[]): number {
    return components.reduce((total, component) => total + component.value, 0);
}
