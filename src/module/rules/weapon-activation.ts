/**
 * Weapon activation modes — the "powered ↔ deactivated" toggle.
 *
 * Some weapons have a powered state that grants qualities and a deactivated
 * state that strips them (a chainsword without power is a primitive club; a
 * shock whip without a charge loses Shocking; a power weapon loses its field
 * and the penetration it confers). This module is the content-agnostic core:
 * it applies a weapon's *deactivated profile* to the already-resolved effective
 * qualities / stats. Which qualities a given weapon gains or loses when off — and
 * any damage/penetration delta — is content, authored on the weapon document's
 * `system.activation.deactivated`, never hardcoded here (Direction #7).
 *
 * The split mirrors the pack schema conventions: the *config* (`activatable` +
 * the deactivated profile) is line-authored rules content under
 * `system.activation`, while the live *toggle* is transient state under
 * `system.state.activated` (per src/packs CLAUDE.md "Stateful Fields Live Under
 * system.state"). These helpers therefore take the two separately.
 *
 * Pure and Foundry-free so it unit-tests without standing up a DataModel; the
 * WeaponData getters call these from `effectiveSpecial` / `effectiveDamageFormula`
 * / `effectivePenetration`, so the toggle flows through to attack + damage rolls
 * automatically (those read the effective getters).
 */

/** The profile applied to a weapon when it is in its deactivated state. */
export interface DeactivationProfile {
    /** Qualities the weapon GAINS while deactivated (e.g. 'primitive', 'unbalanced'). */
    addedQualities: Iterable<string>;
    /** Qualities the weapon LOSES while deactivated (e.g. 'tearing', 'balanced', 'powerField', 'shocking'). */
    removedQualities: Iterable<string>;
    /** Damage bonus delta while deactivated (usually 0 — most deactivations only change qualities). */
    damage: number;
    /** Penetration delta while deactivated (e.g. a power weapon loses its field's penetration). */
    penetration: number;
}

/**
 * A weapon's activation *config* — the line-authored rules content under
 * `system.activation`. The live on/off value is NOT here; it is transient state
 * read separately from `system.state.activated`.
 */
export interface WeaponActivationConfig {
    /** Whether this weapon has a powered/deactivated toggle at all. */
    activatable: boolean;
    deactivated: DeactivationProfile;
}

/**
 * True when the weapon is currently deactivated: it is activatable AND its live
 * `system.state.activated` toggle is off. A non-activatable weapon (the common
 * case) is never "deactivated". Narrows `config` to non-undefined for callers.
 */
export function isDeactivated(config: WeaponActivationConfig | undefined, activated: boolean): config is WeaponActivationConfig {
    return config?.activatable === true && !activated;
}

/**
 * Fold a weapon's deactivated quality profile into an effective-quality set.
 * No-op (returns the set unchanged) when the weapon is active or not activatable.
 * Removals apply before additions so a profile can both strip a powered quality
 * and add a deactivated one. Mutates and returns `qualities`.
 */
export function applyDeactivationQualities(qualities: Set<string>, config: WeaponActivationConfig | undefined, activated: boolean): Set<string> {
    if (!isDeactivated(config, activated)) return qualities;
    for (const quality of config.deactivated.removedQualities) qualities.delete(quality);
    for (const quality of config.deactivated.addedQualities) qualities.add(quality);
    return qualities;
}

/**
 * Damage / penetration deltas to apply when deactivated. Returns 0/0 when the
 * weapon is active or not activatable, so callers can add unconditionally.
 */
export function deactivationStatDeltas(config: WeaponActivationConfig | undefined, activated: boolean): { damage: number; penetration: number } {
    if (!isDeactivated(config, activated)) return { damage: 0, penetration: 0 };
    return { damage: config.deactivated.damage, penetration: config.deactivated.penetration };
}
