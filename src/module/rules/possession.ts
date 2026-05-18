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
 */

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
    const used = Math.max(0, Math.trunc(slot.unleashUsed));
    const max = Math.max(0, Math.trunc(slot.unleashMax));
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
    const wp = Math.max(0, Math.trunc(willpowerTotal));
    const cp = Math.max(0, Math.trunc(corruptionPoints));
    const tier = cp >= 91 ? 3 : cp >= 61 ? 2 : cp >= 31 ? 1 : 0;
    return Math.max(0, wp - 10 * tier);
}
