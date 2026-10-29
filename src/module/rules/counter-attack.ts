/**
 * @file Reaction hooks a talent carries — Counter Attack (#603).
 *
 * Every line prints the talent the same way in substance: after a SUCCESSFUL
 * Parry the character may immediately attack the opponent with the parrying
 * weapon, at –20, in every line. A Dodge does not qualify. DH2 alone adds a
 * frequency limit; the other five lines have none beyond the Reaction the Parry
 * itself spends.
 *
 * DH2's "once per turn" means once per ROUND (operator ruling, #603): DH2 uses
 * "turn" loosely for the round-scoped Reaction allowance, as it does for the one
 * Reaction a round, for Parry, and for Step Aside's extra Evasion per round.
 * So the limit resets when the combat round advances, not on each combatant's
 * turn — which is what keeps a Step Aside character's second Parry in the same
 * round from earning a second Counter Attack.
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

/** How often a reaction hook may be used: once per combat round, or without a limit of its own. */
export const REACTION_HOOK_LIMITS = ['perRound', 'none'] as const;
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

/** One combat round: a combat and its round number. */
export interface CombatRoundStamp {
    readonly combatId: string;
    readonly round: number;
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
    /** The round a per-round hook was last used in, or null. */
    readonly lastUsed: CombatRoundStamp | null;
    /** The current combat round, or null out of combat. */
    readonly now: CombatRoundStamp | null;
}

/** Whether two stamps name the same combat round. */
export function isSameRound(a: CombatRoundStamp | null, b: CombatRoundStamp | null): boolean {
    return a !== null && b !== null && a.combatId === b.combatId && a.round === b.round;
}

/**
 * The counter-attack a successful Parry earns, or null. A Dodge, a failure, an
 * actor with no `parrySuccess → attack` hook, and a per-round hook already used this
 * round all earn none.
 * @param {CounterAttackInput} input  The evasion, the actor's hooks, and when the hook was last used.
 * @returns {CounterAttackOffer | null}  The offer, or null.
 */
export function counterAttackOffer(input: CounterAttackInput): CounterAttackOffer | null {
    if (input.skill !== 'parry' || !input.success) return null;
    const spentThisRound = isSameRound(input.lastUsed, input.now);
    for (const source of input.sources) {
        // Every hook today is `parrySuccess → attack` (the trigger / grant vocabularies
        // have one member each); widen the match here when a second one lands.
        for (const hook of source.hooks) {
            if (hook.limit === 'perRound' && spentThisRound) continue;
            return { sourceName: source.name, attackModifier: hook.attackModifier, limit: hook.limit };
        }
    }
    return null;
}

/**
 * The item whose per-round hook a successful Parry would have earned, had it not
 * already been used this round — so the card can say why no counter-attack is
 * offered instead of silently leaving it out. Null when the Parry earns an offer,
 * or earns nothing for any other reason (a Dodge, a failure, no hook, out of combat).
 * @param {CounterAttackInput} input  The evasion, the actor's hooks, and when the hook was last used.
 * @returns {string | null}  The spent hook's item name, or null.
 */
export function spentCounterAttack(input: CounterAttackInput): string | null {
    if (input.skill !== 'parry' || !input.success || !isSameRound(input.lastUsed, input.now)) return null;
    if (counterAttackOffer(input) !== null) return null;
    for (const source of input.sources) {
        if (source.hooks.some((hook) => hook.limit === 'perRound')) return source.name;
    }
    return null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * A combat-round stamp read back from an actor flag, or null.
 * @param {unknown} flag  The stored stamp.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag
export function readCombatRoundStamp(flag: unknown): CombatRoundStamp | null {
    if (!isRecord(flag)) return null;
    const { combatId, round } = flag;
    if (typeof combatId !== 'string' || typeof round !== 'number') return null;
    return { combatId, round };
}
