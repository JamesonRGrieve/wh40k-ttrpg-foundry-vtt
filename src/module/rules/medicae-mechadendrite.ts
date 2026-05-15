/**
 * Medicae Mechadendrite — errata p. 183.
 *
 * The original core text described the mechadendrite as a passive
 * augmetic. The official errata adds two mechanical hooks:
 *
 *  1. Stunning Blood Loss as a Half Action (faster than the standard
 *     First Aid Full Action).
 *  2. Allowing the mechadendrite to be used as a melee weapon once
 *     per round in addition to its medicae use.
 *
 * The engine consumer (cybernetic item action) reads these constants
 * to surface the right buttons and resolve the action.
 */

export const MEDICAE_MECHADENDRITE = {
    /** Half-action to clear a Blood Loss condition on a target. */
    bloodLossClearAction: 'half' as const,
    /** Once-per-round melee attack allowance. */
    meleeAttacksPerRound: 1,
};
