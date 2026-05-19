/**
 * Boarding Actions resolver — Rogue Trader (#188 — core.md L9997
 * §Ramming and Boarding Actions, with the Tenebro-Maze / Reinforcements
 * /  Repel Boarders ! / Crew Population / Morale modifiers that show up
 * at L9383, L9463, L10288, L10292, L10321).
 *
 * RAW shape (boarding action):
 *   - The attacker sends boarders across at ≤1 VU. Resolution is a
 *     single opposed Command test between the attacker (boarding-party
 *     commander) and the defender (the ship's commander).
 *   - Each side's Command target is its Command skill total + any
 *     modifiers from hull components (Tenebro-Maze, Reinforcements),
 *     extended actions (Prepare to Repel Boarders!), Crew Population /
 *     Morale penalties, or the GM.
 *   - On a successful boarding test, the attacker inflicts:
 *       • 1 Hull Integrity damage per Degree of Success;
 *       • 1d5 Crew Population damage and 1d5 Morale damage on the
 *         defender (the boarders mauled the ship before withdrawing or
 *         seizing ground).
 *   - On a tie or attacker loss the boarders are repelled with no
 *     damage to the defender. On a defender win by 3+ DoS, the boarding
 *     party is captured or destroyed (caller routes to capture / KIA
 *     handling — `boardersLost: true`).
 *   - Crew Population / Morale modifiers shift the *targets*, not the
 *     rolls themselves; the caller composes the final target externally
 *     and the resolver works on the pre-composed numbers.
 *
 * Pure module: no RNG, no Foundry. The caller rolls the d100s and the
 * 1d5/1d5 damage dice and feeds the totals through {@link resolveBoarding}.
 */

/** Tie in the opposed Command test favours the defender (no breach). */
export const BOARDING_RESOLUTION_FAVORS_DEFENDER = true;

/** Hull-Integrity damage inflicted per Degree of Success on a successful boarding test. */
export const BOARDING_HULL_DAMAGE_PER_DOS = 1;

/** DoS margin for the defender at which the boarding party is captured/destroyed. */
export const BOARDING_BOARDERS_LOST_DOS = 3;

/**
 * Degrees of Success: floor((target − roll) / 10) + 1 on a pass, 0 on a
 * fail. Duplicated locally so this module stays free of cross-rule
 * imports.
 */
export function degreesOfSuccess(roll: number, target: number): number {
    if (roll > target) return 0;
    return Math.floor((target - roll) / 10) + 1;
}

/** Composed Command targets after content modifiers have been applied. */
export interface BoardingOpposedInput {
    /** Attacker (boarding-party commander) d100 roll (1-100). */
    attackerRoll: number;
    /** Attacker's *composed* Command target (skill + modifiers). */
    attackerCommandTarget: number;
    /** Defender (ship commander) d100 roll (1-100). */
    defenderRoll: number;
    /** Defender's *composed* Command target (skill + modifiers). */
    defenderCommandTarget: number;
}

/** Outcome of the opposed Command test. */
export interface BoardingOpposedResolution {
    /** True when the attacker wins (boarders breach and run amok). */
    success: boolean;
    attackerDoS: number;
    defenderDoS: number;
    /** netDoS = attackerDoS − defenderDoS. */
    netDoS: number;
    /**
     * True only when the defender beat the attacker by
     * {@link BOARDING_BOARDERS_LOST_DOS} or more DoS. Caller routes the
     * boarding-party to capture / KIA handling.
     */
    boardersLost: boolean;
}

/**
 * Resolve the opposed Command test between attacker and defender. Tie
 * goes to the defender. Defender wins by 3+ DoS routes to "boarders
 * lost".
 */
export function resolveBoardingOpposed(input: BoardingOpposedInput): BoardingOpposedResolution {
    const attackerPassed = input.attackerRoll <= input.attackerCommandTarget;
    const defenderPassed = input.defenderRoll <= input.defenderCommandTarget;
    const attackerDoS = attackerPassed ? degreesOfSuccess(input.attackerRoll, input.attackerCommandTarget) : 0;
    const defenderDoS = defenderPassed ? degreesOfSuccess(input.defenderRoll, input.defenderCommandTarget) : 0;
    const netDoS = attackerDoS - defenderDoS;
    // Attacker only wins on strictly more DoS AND a passed roll. If the
    // attacker fluffed the roll outright the boarders never made it
    // across the gap — no breach.
    const success = attackerPassed && netDoS > 0;
    const boardersLost = !success && -netDoS >= BOARDING_BOARDERS_LOST_DOS;
    return { success, attackerDoS, defenderDoS, netDoS, boardersLost };
}

/** Inputs for the post-success damage payload. */
export interface BoardingDamageInput {
    /** netDoS from the opposed test — `BOARDING_HULL_DAMAGE_PER_DOS × netDoS` Hull damage. */
    netDoS: number;
    /** Pre-rolled 1d5 crew-population damage (1-5). */
    rolledCrewD5: number;
    /** Pre-rolled 1d5 morale damage (1-5). */
    rolledMoraleD5: number;
}

/** Resolved damage payload. */
export interface BoardingDamageResolution {
    /** Hull Integrity damage applied to the defender. */
    hullDamage: number;
    /** Crew Population damage applied to the defender. */
    crewDamage: number;
    /** Morale damage applied to the defender. */
    moraleDamage: number;
}

/** Compute the defender-side damage payload from a successful boarding test. */
export function computeBoardingDamage(input: BoardingDamageInput): BoardingDamageResolution {
    return {
        hullDamage: Math.max(0, input.netDoS) * BOARDING_HULL_DAMAGE_PER_DOS,
        crewDamage: input.rolledCrewD5,
        moraleDamage: input.rolledMoraleD5,
    };
}

/** Top-level boarding action input — wraps both phases. */
export interface BoardingInput {
    opposed: BoardingOpposedInput;
    /**
     * Pre-rolled crew/morale damage dice. The caller rolls 1d5 + 1d5
     * up front and passes them in; the resolver only reads them when
     * the attacker actually wins.
     */
    rolledCrewD5: number;
    rolledMoraleD5: number;
}

/** Top-level boarding action result. */
export interface BoardingResolution {
    opposed: BoardingOpposedResolution;
    /** Defined only when the attacker breached; null otherwise. */
    damage: BoardingDamageResolution | null;
}

/**
 * Convenience wrapper: resolves the opposed Command test and computes
 * the damage payload when the breach succeeds. On a miss or boarders-lost
 * outcome the damage payload is `null`.
 */
export function resolveBoarding(input: BoardingInput): BoardingResolution {
    const opposed = resolveBoardingOpposed(input.opposed);
    if (!opposed.success) return { opposed, damage: null };
    return {
        opposed,
        damage: computeBoardingDamage({
            netDoS: opposed.netDoS,
            rolledCrewD5: input.rolledCrewD5,
            rolledMoraleD5: input.rolledMoraleD5,
        }),
    };
}
