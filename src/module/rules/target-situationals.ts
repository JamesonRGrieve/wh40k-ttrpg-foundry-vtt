/**
 * Auto-selection of combat situational modifiers from the target's state (#393).
 *
 * When a target is selected (or changed) in the unified roll dialog, the
 * applicable situational modifiers should be pre-ticked from what the target
 * token's state already establishes — Prone, Stunned, Unaware/Surprised,
 * Helpless/Unconscious — so the player no longer has to hand-toggle every row.
 * The player can still override afterward.
 *
 * This module is content-agnostic plumbing: it maps a normalised target-state
 * descriptor to the *keys* of the dialog's existing situational-modifier set
 * (`RANGED_SITUATIONAL_MODIFIERS` / `MELEE_SITUATIONAL_MODIFIERS` in
 * `attack-options.ts`). The modifier VALUES live in that single source — this
 * helper never restates a number. Per Direction #7 it only emits keys that the
 * registry actually defines for the chosen attack variant, so a key whose value
 * is missing simply doesn't get auto-selected.
 *
 * Size is intentionally NOT handled here: the dialog already derives the target
 * Size band straight from the target actor (`_getDefaultSizeKey`), so folding it
 * in would double-count it.
 */

import { getSituationalModifiers } from './attack-options.ts';

/**
 * Normalised target-state flags derived from a target's active conditions.
 * Each flag maps to one situational concept; the ranged-vs-melee key split is
 * resolved by {@link deriveTargetSituationalKeys} from `isRanged`.
 */
export interface TargetCombatState {
    /** Target is lying flat (Prone condition). */
    isProne: boolean;
    /** Target is Stunned and unable to react. */
    isStunned: boolean;
    /** Attacker is unnoticed — Unaware or Surprised target. */
    isUnaware: boolean;
    /** Target is bound, sleeping, unconscious, or otherwise Helpless. */
    isHelpless: boolean;
    /** True for a ranged attack — selects the ranged situational key set. */
    isRanged: boolean;
}

/** A single target-state flag paired with the situational key it selects in
 *  each attack variant. The ranged and melee key for the same concept differ
 *  (the dialog lists "Prone" for ranged but "Prone Target" for melee). */
interface SituationalCandidate {
    active: (state: TargetCombatState) => boolean;
    rangedKey: string;
    meleeKey: string;
}

/**
 * The target-state → situational-key map. Keys are identifiers into the
 * existing situational tables, never modifier values.
 */
const TARGET_STATE_CANDIDATES: readonly SituationalCandidate[] = [
    { active: (s) => s.isProne, rangedKey: 'prone', meleeKey: 'proneTarget' },
    { active: (s) => s.isStunned, rangedKey: 'stunnedTarget', meleeKey: 'stunnedTarget' },
    { active: (s) => s.isUnaware, rangedKey: 'unawareTarget', meleeKey: 'unawareTarget' },
    { active: (s) => s.isHelpless, rangedKey: 'helplessTarget', meleeKey: 'helplessTarget' },
];

/**
 * Resolve the situational-modifier keys that the target's state implies, for
 * the chosen attack variant. Only keys present in the variant's situational
 * table are emitted (so the modifier value is guaranteed to resolve from the
 * single source). The result is de-duplicated and order-stable.
 *
 * Pure: no Foundry access. The caller extracts {@link TargetCombatState} from
 * the target token and merges the returned keys into the dialog's active set.
 */
export function deriveTargetSituationalKeys(state: TargetCombatState): string[] {
    const available = new Set(getSituationalModifiers(state.isRanged).map((m) => m.key));
    const keys: string[] = [];
    for (const candidate of TARGET_STATE_CANDIDATES) {
        if (!candidate.active(state)) continue;
        const key = state.isRanged ? candidate.rangedKey : candidate.meleeKey;
        if (available.has(key) && !keys.includes(key)) keys.push(key);
    }
    return keys;
}

/**
 * Build a {@link TargetCombatState} from a set of normalised, lower-cased
 * condition tokens (active-effect names / status ids read off the target
 * actor). Several rulebook conditions collapse onto one situational concept —
 * Unconscious is a flavour of Helpless; Surprised is a flavour of Unaware — and
 * that collapse is centralised here so the extraction site stays a thin reader.
 *
 * Pure: the impure token-collection step belongs to the caller.
 */
export function targetCombatStateFromConditions(conditions: ReadonlySet<string>, isRanged: boolean): TargetCombatState {
    return {
        isProne: conditions.has('prone'),
        isStunned: conditions.has('stunned'),
        isUnaware: conditions.has('unaware') || conditions.has('surprised'),
        isHelpless: conditions.has('helpless') || conditions.has('unconscious'),
        isRanged,
    };
}
