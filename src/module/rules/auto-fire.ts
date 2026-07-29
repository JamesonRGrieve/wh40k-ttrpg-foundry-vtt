/**
 * @file Auto-fire burst resolution — shots fired vs hits scored (#510, #511, #512).
 *
 * DH2 core ch. VII gives a burst three separate numbers, and the system used to
 * collapse them into one (`rollData.fireRate`), which is where all three bugs
 * came from:
 *
 *   1. HOW MANY ROUNDS LEAVE THE GUN. Ch. V, Rate of Fire: the RoF entry is
 *      "how many rounds or charges it expends"; ch. V, Indirect, confirms the
 *      whole burst is fired even when it misses ("the remaining missed hits …
 *      are still fired, but miss their target"). Storm "doubles … the amount of
 *      ammunition expended".
 *   2. HOW MANY HITS THE ROLL EARNS. Semi-Auto: "a hit for the initial degree
 *      of success plus an additional hit for every two additional degrees of
 *      success". Full Auto: "one hit with his weapon per degree of success".
 *      Suppressing Fire uses the two-DoS progression whichever mode was fired.
 *   3. THE CEILING ON HITS. "cannot exceed the weapon's [semi-automatic /
 *      fully automatic] rate of fire" — and Storm explicitly does NOT raise it
 *      ("up to the weapon's firing rate, as normal"), even though it doubles
 *      both the hits earned and the ammunition burned.
 *
 * Pure: no Foundry globals, no document reads. The callers supply the weapon's
 * rate of fire and how many shots the clip can afford.
 */

/** Which rate-of-fire entry a burst action draws its ceiling and ammunition from. */
export type BurstMode = 'semi' | 'full';

/** A weapon's three rate-of-fire entries (`S/2/4` → single, semi 2, full 4). */
export interface RateOfFire {
    readonly semi: number;
    readonly full: number;
}

/**
 * Every action that fires a burst, and which RoF entry it draws on.
 *
 * Suppressing Fire is here because it "fires a Full Auto or Semi-Auto Burst (as
 * per the Full Auto and Semi-Auto Burst actions) and expends the appropriate
 * ammo" — omitting it left it firing a single round and scoring a single hit.
 *
 * Melee multi-attacks (Swift / Lightning) and psychic barrage / storm share the
 * hit PROGRESSIONS but are deliberately absent: they have no rate of fire, so no
 * ceiling and no ammunition.
 */
const BURST_ACTIONS: Readonly<Record<string, BurstMode>> = {
    'Semi-Auto Burst': 'semi',
    'Full Auto Burst': 'full',
    'Suppressing Fire - Semi': 'semi',
    'Suppressing Fire - Full': 'full',
};

/** The RoF entry a burst action draws on, or null when the action is not a burst. */
export function burstModeForAction(action: string): BurstMode | null {
    return BURST_ACTIONS[action] ?? null;
}

/** Whether this action's hits are capped by the weapon's rate of fire. */
export function isBurstAction(action: string): boolean {
    return burstModeForAction(action) !== null;
}

/** Coerce an authored rate-of-fire entry to a non-negative integer. */
function rofEntry(rateOfFire: RateOfFire | null | undefined, mode: BurstMode): number {
    const raw = mode === 'full' ? rateOfFire?.full : rateOfFire?.semi;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** What a burst actually does: how much ammunition it burns and how many hits it may score. */
export interface BurstResolution {
    /** Rounds/charges that leave the weapon — Storm-doubled, clamped by the clip. */
    readonly shotsFired: number;
    /** Ceiling on hits scored — the mode's RoF, NEVER Storm-doubled, and never above `shotsFired`. */
    readonly maxHits: number;
}

/** Inputs to {@link resolveBurst}. */
export interface BurstInput {
    /** The declared action name. */
    readonly action: string;
    /** The weapon's rate of fire. */
    readonly rateOfFire: RateOfFire | null | undefined;
    /** Whether the weapon has the Storm quality. */
    readonly storm: boolean;
    /**
     * How many shots the clip can pay for right now, or null when the weapon
     * does not consume ammunition (a RoF ceiling still applies — see #512).
     */
    readonly affordableShots: number | null;
}

/**
 * Resolve a burst into its ammunition cost and its hit ceiling.
 *
 * Returns `shotsFired: 1, maxHits: 1` for a non-burst action, so a Standard
 * Attack and a melee swing pass through unchanged.
 * @param {BurstInput} input  The declared action, the weapon's RoF, Storm, and the affordable shots.
 * @returns {BurstResolution}  Rounds expended and the ceiling on hits.
 */
export function resolveBurst(input: BurstInput): BurstResolution {
    const mode = burstModeForAction(input.action);
    if (mode === null) {
        const single = input.affordableShots === null ? 1 : Math.max(0, Math.min(1, input.affordableShots));
        return { shotsFired: single, maxHits: single };
    }

    const rof = rofEntry(input.rateOfFire, mode);
    const stormMultiplier = input.storm ? 2 : 1;

    // Storm burns twice the ammunition…
    const wanted = rof * stormMultiplier;
    const shotsFired = input.affordableShots === null ? wanted : Math.max(0, Math.min(wanted, Math.trunc(input.affordableShots)));

    // …but the ceiling stays at the weapon's rate of fire ("as normal"). A burst
    // cut short by an empty clip cannot land more hits than it fired shots.
    const maxHits = Math.min(rof, shotsFired);

    return { shotsFired, maxHits };
}

/**
 * Hits earned by the roll, before the rate-of-fire ceiling.
 *
 * `semi` is the "initial degree of success plus one per two additional degrees"
 * progression — which Suppressing Fire also uses, whichever mode it fired.
 * `full` is one hit per degree of success.
 * @param {BurstMode} progression  Which progression the action uses.
 * @param {number} degreesOfSuccess  Degrees of success on the attack test (≥ 1 on a hit).
 * @returns {number}  Total hits earned, at least 1.
 */
export function hitsForDegrees(progression: BurstMode, degreesOfSuccess: number): number {
    const dos = Number.isFinite(degreesOfSuccess) ? Math.trunc(degreesOfSuccess) : 1;
    if (dos < 1) return 1;
    return progression === 'full' ? dos : 1 + Math.floor((dos - 1) / 2);
}
