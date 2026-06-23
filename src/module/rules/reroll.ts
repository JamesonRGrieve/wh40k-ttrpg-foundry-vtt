/**
 * Pure logic for content-driven re-roll variants (the engine behind the
 * roll-result chat card's per-source re-roll buttons). Talents/traits declare a
 * `reroll` block (see `data/shared/reroll-template.ts`); `WH40KBaseActor.
 * getRerollOptions` walks the actor's owned items, runs each through the
 * predicates here, and surfaces the survivors as buttons separate from the
 * global Spend-Fate re-roll. Kept Foundry-free so it unit-tests under happy-dom
 * and stays the single source of truth for applicability + use-availability.
 */

type RerollCondition = 'failed' | 'success' | 'any';
export type RerollFrequency = 'at-will' | 'per-encounter' | 'per-session';
type RerollAppliesMode = 'any' | 'types' | 'keys';

/** The declared `reroll` block on a talent/trait DataModel. */
export interface RerollSpec {
    enabled: boolean;
    modifier: number;
    condition: RerollCondition;
    appliesTo: { mode: RerollAppliesMode; types: string[]; keys: string[] };
    frequency: RerollFrequency;
    uses: number;
    label: string;
}

/** The minimal roll-result context the applicability check reads. */
export interface RerollRollContext {
    /** Whether the original roll succeeded. */
    success: boolean;
    /** `rollData.type`, e.g. `'Characteristic'` | `'Skill'` | `'Attack'`. */
    type: string;
    /** `rollData.rollKey`, e.g. `'awareness'` | `'willpower'`. */
    rollKey: string;
}

/** A re-roll option surfaced on the chat card. */
export interface RerollOption {
    /** Variant id: `'fate'`, `${itemId}:${frequency}`, or a hook-supplied id. */
    id: string;
    kind: 'fate' | 'item' | 'external';
    /** Button label (item name or override). */
    label: string;
    /** Signed modifier applied to the re-rolled test (0 = plain re-roll). */
    modifier: number;
    /** Human-readable source (item/module name) for chat narration. */
    source: string;
    /** True when the use window is exhausted (button rendered disabled). */
    disabled: boolean;
    frequency: RerollFrequency;
}

/**
 * Whether a declared re-roll applies to the given roll result. Gates on the
 * success/failure `condition` then the `appliesTo` test-type / test-key filter.
 */
export function rerollApplies(spec: RerollSpec, ctx: RerollRollContext): boolean {
    if (!spec.enabled) return false;
    if (spec.condition === 'failed' && ctx.success) return false;
    if (spec.condition === 'success' && !ctx.success) return false;
    const { mode, types, keys } = spec.appliesTo;
    if (mode === 'types') return types.includes(ctx.type);
    if (mode === 'keys') return keys.includes(ctx.rollKey);
    return true; // 'any'
}

/**
 * Stable ledger key for a windowed re-roll use, scoped to the granting item and
 * its frequency window so multiple re-roll items on one actor track separately.
 */
export function rerollLedgerKey(itemId: string, frequency: RerollFrequency): string {
    return `${itemId}:${frequency}`;
}

/**
 * Whether a re-roll still has uses left given how many have been consumed in the
 * current frequency window. `at-will` re-rolls are never exhausted.
 */
export function rerollUseAvailable(spec: RerollSpec, consumed: number): boolean {
    if (spec.frequency === 'at-will') return true;
    return consumed < Math.max(1, spec.uses);
}
