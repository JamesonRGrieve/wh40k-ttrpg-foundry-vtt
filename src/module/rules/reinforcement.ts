/**
 * Reinforcement Character call-in (core.md §"Reinforcement Characters",
 * p. 294).
 *
 * When the warband needs to swap an Acolyte mid-mission (the original
 * is dead, captured, or otherwise out of the picture), an Inquisitor
 * may dispatch a Reinforcement. Cost: an Influence test, modified by
 * the candidate's threat tier.
 *
 * Pairs with #68 (Requisition Test math). The `isReinforcement` flag
 * on the NPC schema (#73) marks which NPCs are eligible.
 */

export type ReinforcementTier = 'standard' | 'specialist' | 'elite' | 'master';

/**
 * Influence-test target modifier by tier (core.md p. 294).
 * Standard rookies are easy to call in; Master operatives are very hard.
 */
export const REINFORCEMENT_MODIFIER: Record<ReinforcementTier, number> = {
    standard: 0,
    specialist: -10,
    elite: -20,
    master: -30,
};

/** Whether the tier exists in the modifier table. */
export function isReinforcementTier(value: unknown): value is ReinforcementTier {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REINFORCEMENT_MODIFIER, value);
}

/**
 * Resolve the reinforcement-call test target: Influence + tier modifier.
 * Returns 0 if the inputs are bad.
 */
export function getReinforcementCallTarget(influence: number, tier: ReinforcementTier): number {
    const inf = Math.max(0, Math.trunc(influence));
    const mod = REINFORCEMENT_MODIFIER[tier];
    return Math.max(0, inf + mod);
}
