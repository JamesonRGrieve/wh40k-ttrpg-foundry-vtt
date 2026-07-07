/**
 * Equipped-weapon hand-budget arithmetic (#418).
 *
 * Pure functions over hand counts. Drawing/equipping a weapon consumes hands
 * according to its handedness; the sum of the hands consumed by all equipped
 * weapons must never exceed the actor's available hands. The default budget is
 * two hands, but creatures with a non-standard anatomy expose their own count,
 * so the available total is always passed in — never assumed.
 *
 * The caller (the combat-station panel context builder and the draw/holster
 * action handler) owns all I/O: it reads the actor's available hands and each
 * weapon's `isTwoHanded` flag, then delegates the arithmetic here. This module
 * has no Foundry dependency so it unit-tests in isolation and homologates across
 * all seven game systems (handedness is a shared weapon-template field).
 */

/** Hands available to a standard bipedal actor when none is recorded. */
export const DEFAULT_AVAILABLE_HANDS = 2;

/** Hands a two-handed weapon consumes. */
export const TWO_HANDED_COST = 2;

/** Hands a one-handed weapon consumes. */
export const ONE_HANDED_COST = 1;

/**
 * A resolved hand budget for an actor at a point in time.
 */
export interface HandBudget {
    /** Total hands the actor has available. */
    readonly available: number;
    /** Hands currently consumed by equipped weapons. */
    readonly used: number;
    /** Hands still free (never negative; see {@link overCommitted} for the raw gap). */
    readonly remaining: number;
    /** True when equipped weapons already consume more hands than the actor has. */
    readonly overCommitted: boolean;
}

/**
 * Hands a single weapon consumes given its handedness.
 * @param isTwoHanded Whether the weapon requires two hands (its `isTwoHanded` getter).
 */
export function handsForWeapon(isTwoHanded: boolean): number {
    return isTwoHanded ? TWO_HANDED_COST : ONE_HANDED_COST;
}

/**
 * Coerce a raw available-hands value read off an actor into a usable count.
 * Non-finite, missing, or negative values fall back to the standard two hands;
 * fractional values are floored (you cannot wield with half a hand).
 * @param raw The recorded hand count, if any.
 */
export function resolveAvailableHands(raw: number | null | undefined): number {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) {
        return DEFAULT_AVAILABLE_HANDS;
    }
    const floored = Math.floor(raw);
    return floored < 0 ? DEFAULT_AVAILABLE_HANDS : floored;
}

/**
 * Sum the hands consumed by a set of equipped-weapon hand costs.
 * @param costs Per-weapon hand costs (from {@link handsForWeapon}).
 */
export function totalHandsUsed(costs: readonly number[]): number {
    return costs.reduce((sum, cost) => sum + cost, 0);
}

/**
 * Resolve the current hand budget from the available total and the hand costs
 * of every currently-equipped weapon.
 * @param available Total hands the actor has (already resolved).
 * @param equippedCosts Hand cost of each equipped weapon.
 */
export function computeHandBudget(available: number, equippedCosts: readonly number[]): HandBudget {
    const used = totalHandsUsed(equippedCosts);
    return {
        available,
        used,
        remaining: Math.max(0, available - used),
        overCommitted: used > available,
    };
}

/**
 * Whether a weapon costing `cost` hands can be drawn given the hands consumed by
 * the weapons already equipped. The candidate weapon's own cost is NOT part of
 * `equippedCosts` — pass the costs of the *other* equipped weapons.
 * @param available Total hands the actor has (already resolved).
 * @param otherEquippedCosts Hand cost of each already-equipped weapon.
 * @param cost Hand cost of the weapon being drawn.
 */
export function canEquipWeapon(available: number, otherEquippedCosts: readonly number[], cost: number): boolean {
    return totalHandsUsed(otherEquippedCosts) + cost <= available;
}
