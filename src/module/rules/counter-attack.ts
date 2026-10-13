/**
 * @file Reaction hooks a talent carries — Counter Attack (#603).
 *
 * Every line prints the talent the same way in substance: after a SUCCESSFUL
 * Parry the character may immediately attack the opponent "using the weapon with
 * which he Parried", at –20 (DH2 core p. 125, DH1, RT, DW, BC, OW). DH2 alone adds
 * "Once per turn". A Dodge does not qualify.
 *
 * The talent's compendium document declares this as a structured hook
 * (`system.reactionHooks`, {@link ReactionHook}) — the trigger, what it grants,
 * how often, and the attack's modifier — so nothing in `src/` names the talent.
 *
 * Pure: no Foundry globals, no document reads.
 */

import type { EvasionSkill } from './evasion.ts';

/** What fires a reaction hook. */
export const REACTION_HOOK_TRIGGERS = ['parrySuccess'] as const;
export type ReactionHookTrigger = (typeof REACTION_HOOK_TRIGGERS)[number];

/** What a reaction hook grants. */
export const REACTION_HOOK_GRANTS = ['attack'] as const;
export type ReactionHookGrant = (typeof REACTION_HOOK_GRANTS)[number];

/** How often a reaction hook may be used. */
export const REACTION_HOOK_LIMITS = ['perTurn', 'none'] as const;
export type ReactionHookLimit = (typeof REACTION_HOOK_LIMITS)[number];

/** A structured reaction hook on a talent (`system.reactionHooks[]`). */
export interface ReactionHook {
    readonly trigger: ReactionHookTrigger;
    readonly grants: ReactionHookGrant;
    readonly limit: ReactionHookLimit;
    /** The modifier on the granted attack's test (Counter Attack: –20). */
    readonly attackModifier: number;
}

/** An owned item and the reaction hooks it declares. */
export interface ReactionHookSource {
    readonly name: string;
    readonly hooks: readonly ReactionHook[];
}

/** One combat turn: a combat, a round, and the turn within it. */
export interface CombatTurnStamp {
    readonly combatId: string;
    readonly round: number;
    readonly turn: number;
}

/** The counter-attack an evasion earned. */
export interface CounterAttackOffer {
    /** The granting item's name — the attack modifier's provenance. */
    readonly sourceName: string;
    readonly attackModifier: number;
    readonly limit: ReactionHookLimit;
}

/** Inputs to {@link counterAttackOffer}. */
export interface CounterAttackInput {
    readonly skill: EvasionSkill;
    readonly success: boolean;
    readonly sources: readonly ReactionHookSource[];
    /** The turn a per-turn hook was last used in, or null. */
    readonly lastUsed: CombatTurnStamp | null;
    /** The current combat turn, or null out of combat. */
    readonly now: CombatTurnStamp | null;
}

/** Whether two stamps name the same combat turn. */
export function isSameTurn(a: CombatTurnStamp | null, b: CombatTurnStamp | null): boolean {
    return a !== null && b !== null && a.combatId === b.combatId && a.round === b.round && a.turn === b.turn;
}

/**
 * The counter-attack a successful Parry earns, or null. A Dodge, a failure, an
 * actor with no `parrySuccess → attack` hook, and a per-turn hook already used this
 * turn all earn none.
 * @param {CounterAttackInput} input  The evasion, the actor's hooks, and when the hook was last used.
 * @returns {CounterAttackOffer | null}  The offer, or null.
 */
export function counterAttackOffer(input: CounterAttackInput): CounterAttackOffer | null {
    if (input.skill !== 'parry' || !input.success) return null;
    const spentThisTurn = isSameTurn(input.lastUsed, input.now);
    for (const source of input.sources) {
        // Every hook today is `parrySuccess → attack` (the trigger / grant vocabularies
        // have one member each); widen the match here when a second one lands.
        for (const hook of source.hooks) {
            if (hook.limit === 'perTurn' && spentThisTurn) continue;
            return { sourceName: source.name, attackModifier: hook.attackModifier, limit: hook.limit };
        }
    }
    return null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * A combat-turn stamp read back from an actor flag, or null.
 * @param {unknown} flag  The stored stamp.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag
export function readCombatTurnStamp(flag: unknown): CombatTurnStamp | null {
    if (!isRecord(flag)) return null;
    const { combatId, round, turn } = flag;
    if (typeof combatId !== 'string' || typeof round !== 'number' || typeof turn !== 'number') return null;
    return { combatId, round, turn };
}
