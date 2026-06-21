/**
 * Daemonic possession track helpers (#82 — beyond.md p.69).
 *
 * The actor's `system.possession` slot stores the current possession
 * state (none / latent / possessed), the per-session Unleash Daemon
 * uses spent, and the maximum allowed per session (derived from the
 * actor's Corruption tier).
 *
 * These pure helpers compute the predicates and test targets the engine
 * consumer needs without reaching into Foundry runtime. UI wiring
 * (sheet panel + session-boundary reset hook) is the follow-up.
 *
 * #132 extends this with the Possession-power Frenzy-test loop and the
 * mismanifest opposed-Willpower cascade (beyond.md L2095-2116).
 */

import { clampRoll, degreesOfFailure, degreesOfSuccess } from './_dice.ts';
import { nonNegInt } from './_num.ts';

export type PossessionState = 'none' | 'latent' | 'possessed';

export interface PossessionSlot {
    state: PossessionState;
    unleashUsed: number;
    unleashMax: number;
}

/**
 * Whether the actor has at least one Unleash Daemon use remaining this
 * session. Requires the actor to be in the `latent` or `possessed`
 * state — `none` precludes the action entirely.
 */
export function canUnleashDaemon(slot: PossessionSlot): boolean {
    if (slot.state === 'none') return false;
    const used = nonNegInt(slot.unleashUsed);
    const max = nonNegInt(slot.unleashMax);
    return used < max;
}

/**
 * Resolve the post-Unleash slot after spending one charge. No-ops when
 * no charge is available (caller should gate on `canUnleashDaemon`).
 */
export function spendUnleashDaemon(slot: PossessionSlot): PossessionSlot {
    if (!canUnleashDaemon(slot)) return slot;
    return { ...slot, unleashUsed: slot.unleashUsed + 1 };
}

/**
 * Reset the per-session Unleash-Daemon count to zero. Called at the
 * session boundary by the GM-side reset hook.
 */
export function resetSessionUnleash(slot: PossessionSlot): PossessionSlot {
    return { ...slot, unleashUsed: 0 };
}

/**
 * Willpower test target for the actor's per-round Possession resist
 * test. Per RAW: the target is WP − (10 × corruption tier), where the
 * corruption tier increases harshness as the actor accrues CP.
 *
 *  - 0–30 CP  → tier 0 (no penalty)
 *  - 31–60 CP → tier 1 (−10)
 *  - 61–90 CP → tier 2 (−20)
 *  - 91+ CP   → tier 3 (−30)
 *
 * Capped at 0 (never returns a negative target).
 */
export function getResistDaemonTarget(willpowerTotal: number, corruptionPoints: number): number {
    const wp = nonNegInt(willpowerTotal);
    const cp = nonNegInt(corruptionPoints);
    const tier = cp >= 91 ? 3 : cp >= 61 ? 2 : cp >= 31 ? 1 : 0;
    return Math.max(0, wp - 10 * tier);
}

/* ----------------------------------------------------------------- */
/*  Frenzy-test loop (#132 — beyond.md L2095-2116)                    */
/* ----------------------------------------------------------------- */

/**
 * The Possession power (beyond.md p. 67) grants the manifester
 * Daemonic (½ PR) + Unnatural Strength (½ PR) + Deadly Natural Weapons
 * for as long as the power is sustained. The price is two recurring
 * tests:
 *
 *  1. **Per-round Frenzy test** — a Challenging (+0) Willpower test
 *     EVERY round the power is sustained. A failure pushes the psyker
 *     into a Frenzied state (per the Frenzy talent). While Frenzied the
 *     psyker MUST keep sustaining the power (the special exception to
 *     the no-psychic-powers-while-Frenzied rule).
 *
 *  2. **Mismanifest cascade** — a Psychic Phenomena result when
 *     manifesting Possession means a more powerful Daemon answered the
 *     invitation. The psyker makes an Opposed Willpower test against the
 *     Daemon; on a loss, the Daemon takes over and the actor escalates
 *     to the full `possessed` state (beyond.md p. 69, composes with the
 *     #82 possession track).
 *
 * The state machine the consumer drives:
 *
 *   none ──(power sustained)──▶ latent (contested) ──(mismanifest loss)──▶ possessed
 *                                  │
 *                                  └─(per-round Frenzy test fail)─▶ stays latent, isFrenzied=true
 *
 * `latent` is the "contested" phase (the power is sustained and the
 * Frenzy test recurs each round); `possessed` is the terminal
 * full-daemon state. Helpers here are pure — the per-round hook, the
 * mismanifest hook, and the chat cards are wired by the
 * character-sheet / engine layer.
 */

/**
 * Resolve a single d100 roll-under test into its pass flag and the
 * magnitude of the result. `degrees` is the (always-positive) count of
 * 10-point bands the roll cleared the target by on a pass, or missed it
 * by on a fail; `passed` is the discriminant. Roll is clamped to the
 * legal 1..100 d100 range and the target floored at 0.
 */
function signedDegrees(roll: number, target: number): { passed: boolean; degrees: number } {
    const r = clampRoll(roll);
    const t = nonNegInt(target);
    if (r <= t) return { passed: true, degrees: degreesOfSuccess(r, t) };
    return { passed: false, degrees: degreesOfFailure(r, t) };
}

/**
 * Whether the per-round Frenzy test even applies. The Frenzy-test loop
 * runs only while the Possession power is being sustained — i.e. the
 * actor is in the `latent` (contested) state. In `none` there is no
 * power; in `possessed` the daemon is already in control, so the
 * psyker no longer rolls to stave it off.
 */
export function isFrenzyTestActive(slot: PossessionSlot): boolean {
    return slot.state === 'latent';
}

/** Result of one per-round Possession Frenzy test. */
export interface FrenzyTestResult {
    /** True when the Willpower test passed (no Frenzy this round). */
    passed: boolean;
    /** Degrees of success (≥1) on a pass, 0 on a fail. */
    degreesOfSuccess: number;
    /** Degrees of failure (≥1) on a fail, 0 on a pass. */
    degreesOfFailure: number;
    /** True when the psyker enters / remains in a Frenzied state. */
    isFrenzied: boolean;
    /** Echoed Willpower target the test was rolled against. */
    target: number;
}

/**
 * Resolve one round's Possession Frenzy test. RAW: a Challenging (+0)
 * Willpower test each round the power is sustained — the target is the
 * actor's full Willpower (no Possession-specific modifier; corruption
 * harshness applies to the *resist-daemon* test, not this one). A
 * failure means the psyker is Frenzied for the round but, per the
 * special exception, must keep sustaining the power.
 *
 * @param roll            Pre-rolled 1d100 for the Willpower test.
 * @param willpowerTotal  Actor's full Willpower characteristic total.
 */
export function resolveFrenzyTest(roll: number, willpowerTotal: number): FrenzyTestResult {
    const target = nonNegInt(willpowerTotal);
    const { passed, degrees } = signedDegrees(roll, target);
    return {
        passed,
        degreesOfSuccess: passed ? degrees : 0,
        degreesOfFailure: passed ? 0 : degrees,
        isFrenzied: !passed,
        target,
    };
}

/** Outcome of the mismanifest opposed-Willpower contest vs the Daemon. */
export interface MismanifestResolution {
    /** True when the psyker won (or tied) the opposed Willpower test. */
    psykerWon: boolean;
    /** Psyker's degrees of success (0 when the psyker failed the roll). */
    psykerDoS: number;
    /** Daemon's degrees of success (0 when the daemon failed the roll). */
    daemonDoS: number;
    /** The possession state the actor transitions to after the contest. */
    nextState: PossessionState;
    /** True when the contest escalated the actor to full possession. */
    escalatedToPossessed: boolean;
}

/**
 * Resolve the mismanifest cascade: a Psychic Phenomena result when
 * manifesting Possession summons a stronger Daemon, and the psyker must
 * win an Opposed Willpower test or be possessed (beyond.md p. 69).
 *
 * Tie semantics favour the psyker (the daemon must strictly out-score
 * the psyker to seize control), matching the opposed-test convention
 * used elsewhere in the rules layer (`grapple.ts`). On a psyker loss
 * the state escalates to `possessed`; otherwise the actor stays in the
 * `latent` (contested) state with the power still sustained. A `none`
 * actor cannot be mismanifested (there is no power) — it is returned
 * unchanged.
 *
 * @param psykerRoll      Psyker's 1d100 Willpower roll.
 * @param psykerWillpower Psyker's Willpower characteristic total.
 * @param daemonRoll      Daemon's 1d100 Willpower roll.
 * @param daemonWillpower Daemon's Willpower characteristic total.
 * @param currentState    The actor's possession state before the contest.
 */
export function resolveMismanifestPossession(
    psykerRoll: number,
    psykerWillpower: number,
    daemonRoll: number,
    daemonWillpower: number,
    currentState: PossessionState,
): MismanifestResolution {
    if (currentState === 'none') {
        return { psykerWon: true, psykerDoS: 0, daemonDoS: 0, nextState: 'none', escalatedToPossessed: false };
    }
    if (currentState === 'possessed') {
        // Already lost — the daemon stays in control, nothing to contest.
        return { psykerWon: false, psykerDoS: 0, daemonDoS: 0, nextState: 'possessed', escalatedToPossessed: false };
    }
    const psyker = signedDegrees(psykerRoll, psykerWillpower);
    const daemon = signedDegrees(daemonRoll, daemonWillpower);
    const psykerDoS = psyker.passed ? psyker.degrees : 0;
    const daemonDoS = daemon.passed ? daemon.degrees : 0;
    // Psyker wins when they pass and the daemon does not, or both pass /
    // both fail and the psyker's DoS is not strictly out-scored.
    const psykerWon = psyker.passed ? psykerDoS >= daemonDoS : !daemon.passed && psykerDoS >= daemonDoS;
    const nextState: PossessionState = psykerWon ? 'latent' : 'possessed';
    return { psykerWon, psykerDoS, daemonDoS, nextState, escalatedToPossessed: !psykerWon };
}

/**
 * Engage the Possession power. Moves a `none` actor into the `latent`
 * (contested) state so the per-round Frenzy-test loop begins. Already
 * contested / possessed actors are returned unchanged (idempotent).
 */
export function beginPossessionContest(slot: PossessionSlot): PossessionSlot {
    if (slot.state !== 'none') return slot;
    return { ...slot, state: 'latent' };
}

/**
 * End a sustained Possession power voluntarily (the psyker stops
 * sustaining). A `latent`/contested actor returns to `none`; a
 * `possessed` actor cannot release the power at will (the daemon
 * decides) and is returned unchanged.
 */
export function endPossessionContest(slot: PossessionSlot): PossessionSlot {
    if (slot.state === 'latent') return { ...slot, state: 'none' };
    return slot;
}

/**
 * Apply a resolved mismanifest contest to the actor's slot, escalating
 * to `possessed` on a psyker loss and otherwise preserving the slot.
 */
export function applyMismanifest(slot: PossessionSlot, resolution: MismanifestResolution): PossessionSlot {
    if (resolution.escalatedToPossessed) return { ...slot, state: 'possessed' };
    return { ...slot, state: resolution.nextState };
}
