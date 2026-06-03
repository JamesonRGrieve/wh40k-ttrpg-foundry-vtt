/**
 * Ramming action resolver — Rogue Trader (#188 — core.md L9997 §Ramming and
 * Boarding Actions, plus the Imposing / Good an' Ard hull bonuses at L9453 /
 * L9778 that explicitly call out "1d10 additional damage when ramming").
 *
 * RAW shape:
 *   - To-hit: opposed Pilot (Space Craft) + Manoeuvrability test between
 *     attacker and defender. Helmsman with more degrees of success lands;
 *     ties go to the defender (the manoeuvring side, which "saw" the ram
 *     coming).
 *   - Damage to defender: (1d10 + attacker Speed) ignoring Void Shields;
 *     defender's Armour is subtracted before the hit reaches Hull
 *     Integrity. Hulls flagged `extraRamDamage` (Imposing / Good an' Ard)
 *     add a flat +1d10 to the rolled damage.
 *   - Damage to attacker: the ram inflicts an equal amount of Hull
 *     Integrity damage back on the attacker (also through their armour,
 *     also through their void shields per RAW — the impact bypasses
 *     shielding on both sides because it is a physical collision).
 *
 * This module exposes:
 *   - {@link RAMMING_RESOLUTION_FAVORS_DEFENDER} — tie-handling primitive.
 *   - {@link degreesOfSuccess} — shared d100 DoS math.
 *   - {@link resolveRammingToHit} — opposed-pilot resolver.
 *   - {@link computeRammingDamage} — rolled-d10 + speed + hull-bonus math
 *     that drives both the defender hit and the attacker rebound, with
 *     armour applied per side. Pure: no RNG, no Foundry.
 *   - {@link resolveRamming} — orchestrating helper that composes the two
 *     above into a single {@link RammingResolution} payload the chat card
 *     can render directly.
 *
 * The helpers are RNG-free; the caller (Starship Document / sheet action)
 * rolls the d100s and the d10 damage die, then feeds the totals in here.
 */

/** Ties in the opposed Pilot test resolve in favor of the defender. */
export const RAMMING_RESOLUTION_FAVORS_DEFENDER = true;

/**
 * Degrees of Success: floor((target − roll) / 10) + 1 when the test passes,
 * 0 otherwise. Mirrors the convention in `grapple.ts`; duplicated rather
 * than imported to keep ship-* modules free of cross-rule cycles.
 */
export function degreesOfSuccess(roll: number, target: number): number {
    if (roll > target) return 0;
    return Math.floor((target - roll) / 10) + 1;
}

/** Input shape for the opposed Pilot (Space Craft) + Manoeuvrability test. */
export interface RammingToHitInput {
    /** Attacker (rammer) d100 roll (1-100). */
    attackerRoll: number;
    /** Attacker's Pilot (Space Craft) skill total including +Manoeuvrability. */
    attackerTarget: number;
    /** Defender d100 roll (1-100). */
    defenderRoll: number;
    /** Defender's Pilot (Space Craft) skill total including +Manoeuvrability. */
    defenderTarget: number;
}

/** Result of the opposed Pilot test. */
export interface RammingToHitResolution {
    /** True when the attacker lands the ram. */
    success: boolean;
    /** Attacker DoS (0 when attacker failed). */
    attackerDoS: number;
    /** Defender DoS (0 when defender failed). */
    defenderDoS: number;
    /** netDoS = attackerDoS − defenderDoS (negative when defender won). */
    netDoS: number;
}

/**
 * Resolve the opposed Pilot (Space Craft) + Manoeuvrability test that
 * decides whether the ram connects. Tie goes to the defender per
 * {@link RAMMING_RESOLUTION_FAVORS_DEFENDER}.
 */
export function resolveRammingToHit(input: RammingToHitInput): RammingToHitResolution {
    const attackerPassed = input.attackerRoll <= input.attackerTarget;
    const defenderPassed = input.defenderRoll <= input.defenderTarget;
    const attackerDoS = attackerPassed ? degreesOfSuccess(input.attackerRoll, input.attackerTarget) : 0;
    const defenderDoS = defenderPassed ? degreesOfSuccess(input.defenderRoll, input.defenderTarget) : 0;
    const netDoS = attackerDoS - defenderDoS;
    // Attacker only wins when they strictly outscore the defender on DoS.
    // (Tie → defender.) An attacker who failed their roll while the
    // defender failed too still loses because the ram needs the attacker
    // to actually steer the collision home — both-fail also routes to the
    // defender.
    const success = attackerPassed && netDoS > 0;
    return { success, attackerDoS, defenderDoS, netDoS };
}

/** Inputs for damage math after a successful ram. */
export interface RammingDamageInput {
    /** Pre-rolled 1d10 damage die (1-10). */
    rolledD10: number;
    /** Attacker's current Speed (added to the damage die per RAW). */
    attackerSpeed: number;
    /** Defender's hull armour, applied to the defender-side hit. */
    defenderArmour: number;
    /** Attacker's hull armour, applied to the rebound hit. */
    attackerArmour: number;
    /**
     * When true the attacker's hull adds +1d10 to the ram damage roll
     * (Imposing / Good an' Ard prow components — core.md L9453, L9778).
     */
    attackerExtraRamDamage?: boolean;
    /**
     * Pre-rolled second d10 (1-10) used only when
     * `attackerExtraRamDamage` is true. Pass 0 to skip the bonus die.
     */
    bonusRolledD10?: number;
}

/** Damage-side payload (a hit applied to one ship's Hull Integrity). */
interface RammingDamageSide {
    /** Raw damage before armour. */
    raw: number;
    /** Armour subtracted from `raw`. */
    armour: number;
    /** Final Hull Integrity damage (`max(0, raw − armour)`). */
    hullDamage: number;
}

/** Full damage payload for a successful ram. */
export interface RammingDamageResolution {
    defender: RammingDamageSide;
    attacker: RammingDamageSide;
    /** Bonus d10 contribution that landed (0 when not applicable). */
    bonusDamage: number;
}

/**
 * Compute the Hull Integrity damage both ships take on a successful ram.
 *
 * Damage = `rolledD10 + attackerSpeed (+ bonusRolledD10 when the attacker
 * hull adds it)`. Armour is applied per side; the result floors at 0 so a
 * heavily armoured target can take no damage while still consuming the
 * action's other consequences.
 */
export function computeRammingDamage(input: RammingDamageInput): RammingDamageResolution {
    const bonusDamage = input.attackerExtraRamDamage === true ? input.bonusRolledD10 ?? 0 : 0;
    const raw = input.rolledD10 + input.attackerSpeed + bonusDamage;
    const defenderHit: RammingDamageSide = {
        raw,
        armour: input.defenderArmour,
        hullDamage: Math.max(0, raw - input.defenderArmour),
    };
    const attackerHit: RammingDamageSide = {
        raw,
        armour: input.attackerArmour,
        hullDamage: Math.max(0, raw - input.attackerArmour),
    };
    return { defender: defenderHit, attacker: attackerHit, bonusDamage };
}

/** Inputs for the orchestrating {@link resolveRamming} helper. */
export interface RammingInput {
    toHit: RammingToHitInput;
    damage: RammingDamageInput;
}

/** Full payload for the chat card / action handler. */
export interface RammingResolution {
    toHit: RammingToHitResolution;
    /** Defined only when the ram landed. */
    damage: RammingDamageResolution | null;
}

/**
 * Convenience wrapper that runs the to-hit resolver and, on a hit,
 * computes the damage payload. On a miss, returns `damage: null` so the
 * chat card can render a "Ram missed" outcome without an awkward zero
 * damage block.
 */
export function resolveRamming(input: RammingInput): RammingResolution {
    const toHit = resolveRammingToHit(input.toHit);
    if (!toHit.success) return { toHit, damage: null };
    return { toHit, damage: computeRammingDamage(input.damage) };
}
