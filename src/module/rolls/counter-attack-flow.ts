/**
 * @file Counter Attack on the evasion card (#603): after a successful Parry, the
 * parrying character's reaction hooks (`rules/counter-attack.ts`) may offer an
 * attack back at the opponent, with the weapon that parried, at the hook's
 * modifier. A per-turn hook is stamped on the actor when used, so it is offered
 * again only on a later turn.
 */

import type { CombatTurnStamp, CounterAttackOffer, ReactionHook, ReactionHookSource } from '../rules/counter-attack.ts';
import { canWeaponParry } from '../rules/weapon-quality-effects.ts';

/** The actor flag a per-turn reaction hook's last use is stamped under. */
export const COUNTER_ATTACK_FLAG = 'counterAttackUsed';

/** The Counter Attack control the evasion card renders. */
export interface CounterAttackCard extends CounterAttackOffer {
    /** The parrying character. */
    readonly actorUuid: string;
    /** The opponent struck back at. */
    readonly attackerUuid: string;
    readonly attackerName: string;
    /** The weapon that parried; '' for bare hands. */
    readonly weaponId: string;
}

/** An owned item as the reaction-hook walk reads it. */
export interface HookBearingItem {
    readonly type: string;
    readonly name: string | null;
    readonly system: object;
}

/**
 * The reaction hooks the actor's talents declare.
 * @param {Iterable<HookBearingItem>} items  The actor's owned items.
 */
export function reactionHookSources(items: Iterable<HookBearingItem>): ReactionHookSource[] {
    const sources: ReactionHookSource[] = [];
    for (const item of items) {
        if (item.type !== 'talent') continue;
        // The talent schema declares `reactionHooks` (initial []), and the compendium
        // join fills it on owned talents.
        const { reactionHooks } = item.system as { reactionHooks: readonly ReactionHook[] };
        if (reactionHooks.length > 0) sources.push({ name: item.name ?? '', hooks: reactionHooks });
    }
    return sources;
}

/** The combat as the turn stamp reads it. */
export interface TurnSource {
    readonly id: string | null;
    readonly started: boolean;
    readonly round: number;
    readonly turn: number | null;
}

/**
 * The current combat turn, or null out of combat.
 * @param {TurnSource | null} combat  The active combat.
 */
export function currentCombatTurn(combat: TurnSource | null): CombatTurnStamp | null {
    if (combat?.id == null || !combat.started) return null;
    return { combatId: combat.id, round: combat.round, turn: combat.turn ?? 0 };
}

/** A held item as {@link parryingWeapon} reads it. */
export interface HeldWeapon {
    readonly id: string | null;
    readonly isMelee: boolean;
    readonly equipped: boolean;
}

/**
 * The weapon a Parry is made with: the first equipped melee weapon that can
 * parry, or null for bare hands. The Counter Attack strikes with it (#603) and its
 * qualities modify the Parry (#414).
 * @param {Iterable<T>} items  The actor's owned items.
 */
export function parryingWeapon<T extends HeldWeapon>(items: Iterable<T>): T | null {
    for (const item of items) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: an owned Foundry Item read through the duck-typed QualityItem canWeaponParry accepts
        if (item.isMelee && item.equipped && canWeaponParry(item as Parameters<typeof canWeaponParry>[0])) return item;
    }
    return null;
}
