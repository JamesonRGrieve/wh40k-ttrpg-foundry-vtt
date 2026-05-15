/**
 * Two-weapon fighting penalty resolver.
 *
 * core.md §"Two-Weapon Fighting" (p. 228):
 *  - Baseline: −20 to both attack rolls when attacking with two weapons.
 *  - Two-Weapon Wielder (Melee/Ranged): drops the **main-hand** penalty to 0.
 *  - Two-Weapon Master (Melee/Ranged): drops **both** penalties to 0.
 *  - Ambidextrous: drops the **off-hand** penalty by an additional 10
 *    (cumulative with Wielder/Master).
 *
 * The talent registry on the actor is read via the same `hasTalent`-style
 * fuzzy lookup used elsewhere in the roll pipeline. We accept either a
 * concrete actor with the lookup method, or an explicit talent-name set
 * for unit-testability without an actor stack.
 */

export interface TwoWeaponPenalties {
    /** Modifier applied to the main-hand attack test. Always ≤ 0. */
    mainPenalty: number;
    /** Modifier applied to the off-hand attack test. Always ≤ 0. */
    offPenalty: number;
}

export interface TwoWeaponContext {
    /** Whether the fighter is attacking with melee weapons (vs ranged) — gates the per-flavour Wielder/Master talent. */
    isMelee: boolean;
    /** Set of canonical talent names on the actor (normalised: title-case, trimmed). */
    talents: ReadonlySet<string>;
}

const WIELDER_MELEE = 'Two-Weapon Wielder (Melee)';
const WIELDER_RANGED = 'Two-Weapon Wielder (Ranged)';
const MASTER_MELEE = 'Two-Weapon Master (Melee)';
const MASTER_RANGED = 'Two-Weapon Master (Ranged)';
const AMBIDEXTROUS = 'Ambidextrous';

/**
 * Resolve the main- and off-hand penalty pair for a two-weapon attack
 * given the fighter's talent state and weapon flavour.
 */
export function resolveTwoWeaponPenalties(ctx: TwoWeaponContext): TwoWeaponPenalties {
    const wielderTalent = ctx.isMelee ? WIELDER_MELEE : WIELDER_RANGED;
    const masterTalent = ctx.isMelee ? MASTER_MELEE : MASTER_RANGED;
    const hasMaster = ctx.talents.has(masterTalent);
    const hasWielder = hasMaster || ctx.talents.has(wielderTalent);
    const hasAmbidextrous = ctx.talents.has(AMBIDEXTROUS);

    // Baseline −20 / −20. Wielder zeroes main-hand. Master zeroes both.
    // Ambidextrous reduces the off-hand penalty by 10 (never raises above 0).
    const mainPenalty = hasWielder ? 0 : -20;
    let offPenalty = hasMaster ? 0 : -20;
    if (hasAmbidextrous) {
        offPenalty = Math.min(0, offPenalty + 10);
    }
    return { mainPenalty, offPenalty };
}
