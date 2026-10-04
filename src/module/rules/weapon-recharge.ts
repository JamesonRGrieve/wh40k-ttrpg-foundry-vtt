/**
 * Weapon recharge — a weapon that must spend the round after firing recharging.
 *
 * Two content sources trigger it, both read from the weapon-quality mechanics
 * (Direction #7): a quality the weapon always carries with `mechanics.recharge`
 * (the Recharge quality), and a selectable quality the attacker chose for this
 * attack with `mechanics.triggersRecharge` (Maximal). RAW, a weapon fired in
 * round N may not fire in round N + 1 and is ready again in round N + 2.
 *
 * Recharge is measured in combat rounds, so it only ever blocks inside the combat
 * it was triggered in; outside combat, or in a later combat, the weapon is ready.
 * Pure and line-agnostic: callers supply the resolved state.
 */

import { getWeaponQualityMechanicsForId } from './weapon-quality-payloads.ts';

/** Where the weapon last fired a recharging shot: the combat and its round. */
export interface RechargeMark {
    combatId: string;
    round: number | null;
}

/** The current combat as the recharge gate needs it, or null outside combat. */
export interface CombatRound {
    id: string;
    round: number;
}

/** Rounds after the firing round that the weapon spends recharging. */
const RECHARGE_ROUNDS = 1;

/**
 * Does this attack leave the weapon recharging? True when the weapon carries a
 * quality with `mechanics.recharge`, or the attacker chose a quality with
 * `mechanics.triggersRecharge` for it.
 */
export function attackTriggersRecharge(qualityIds: Iterable<string> | undefined, chosenQualityIds: readonly string[], systemId?: string): boolean {
    for (const id of qualityIds ?? []) {
        if (getWeaponQualityMechanicsForId(id, systemId)?.recharge === true) return true;
    }
    return chosenQualityIds.some((id) => getWeaponQualityMechanicsForId(id, systemId)?.triggersRecharge === true);
}

/** Is the weapon still recharging in the current combat round? */
export function isRecharging(mark: RechargeMark, combat: CombatRound | null): boolean {
    if (combat === null || mark.round === null || mark.combatId !== combat.id) return false;
    return combat.round <= mark.round + RECHARGE_ROUNDS;
}
