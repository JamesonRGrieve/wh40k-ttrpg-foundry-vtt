/**
 * Daemonic trait immunities + Undying rider (#143 — DH2 Errata L69-73).
 *
 * Per DH2 errata p.366, the Daemonic trait grants:
 *   - Immunity to disease (exposure auto-skips, no resist test).
 *   - Immunity to poison (exposure auto-skips, no resist test).
 *   - The Undying trait — once per session, on the first transition past
 *     the death threshold (wounds reduced past 0), the Daemonic creature
 *     recovers to 1 wound instead of dying.
 *
 * This module exposes the pure predicates. The damage-application path
 * checks `shouldSkipDiseaseExposure` / `shouldSkipPoisonExposure` before
 * resolving the standard disease.ts / poison.ts profiles, and consults
 * `resolveUndyingRevival` on death-state transitions. The session flag
 * lives on the actor (a `flags.wh40k-rpg.undyingUsedInSession` boolean is
 * the canonical home but the resolver leaves storage to the caller).
 *
 * Composes with #82 / #85 daemon wiring — when a Daemonhost is bound,
 * the resulting actor carries the Daemonic trait and inherits these
 * immunities automatically.
 */

/**
 * Minimal duck-typed actor surface. The runtime actor (`WH40KBaseActor`)
 * satisfies this; tests pass plain fixtures.
 *
 * Either `system.traits` (NPC stat blocks, where traits live as inline
 * entries) or an item of type 'trait' on `items` is recognised — the
 * predicate matches case-insensitively against the literal trait name.
 */
export interface DaemonicActorLike {
    system?: {
        traits?: ReadonlyArray<{ name?: string }>;
    };
    items?: Iterable<{ type?: string; name?: string }>;
}

/** Case-insensitive trait-name match against the canonical 'Daemonic' tag. */
export function hasDaemonic(actor: DaemonicActorLike): boolean {
    const inlineTraits = actor.system?.traits;
    if (inlineTraits !== undefined) {
        for (const t of inlineTraits) {
            if (typeof t.name === 'string' && t.name.toLowerCase() === 'daemonic') return true;
        }
    }
    const items = actor.items;
    if (items !== undefined) {
        for (const item of items) {
            if (item.type === 'trait' && typeof item.name === 'string' && item.name.toLowerCase() === 'daemonic') {
                return true;
            }
        }
    }
    return false;
}

/**
 * True when a disease-exposure resolution should be skipped entirely.
 * Wraps `hasDaemonic` so callers needn't know the trait name.
 */
export function shouldSkipDiseaseExposure(actor: DaemonicActorLike): boolean {
    return hasDaemonic(actor);
}

/**
 * True when a poison-exposure resolution should be skipped entirely.
 * Wraps `hasDaemonic` so callers needn't know the trait name.
 */
export function shouldSkipPoisonExposure(actor: DaemonicActorLike): boolean {
    return hasDaemonic(actor);
}

/** Outcome of an Undying check at the death-state transition. */
export interface UndyingRevivalOutcome {
    /** True when the creature was revived (callers must rewrite wounds.value to `newWoundsValue`). */
    revived: boolean;
    /** Target wounds.value after revival; only meaningful when `revived === true`. */
    newWoundsValue: number;
    /** True when the session flag should be set to `true` post-call. */
    consumeSessionFlag: boolean;
}

/**
 * Decide whether a Daemonic creature is revived on the current death
 * transition. Returns a non-revival outcome for non-Daemonic actors, or
 * when the session's once-per-session Undying use has already been
 * consumed.
 *
 * Callers own session-flag storage; pass the current flag value, and
 * write `true` back to the flag when `consumeSessionFlag` is `true`.
 */
export function resolveUndyingRevival(actor: DaemonicActorLike, sessionFlagAlreadyUsed: boolean): UndyingRevivalOutcome {
    if (!hasDaemonic(actor)) {
        return { revived: false, newWoundsValue: 0, consumeSessionFlag: false };
    }
    if (sessionFlagAlreadyUsed) {
        return { revived: false, newWoundsValue: 0, consumeSessionFlag: false };
    }
    return { revived: true, newWoundsValue: 1, consumeSessionFlag: true };
}
