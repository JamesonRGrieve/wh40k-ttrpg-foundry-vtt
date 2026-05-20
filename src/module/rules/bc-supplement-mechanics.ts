/**
 * Black Crusade Supplement Mechanics resolver (#181 — umbrella for the
 * P2 supplement mechanics shared across Tome of Blood, Tome of Decay,
 * Tome of Excess, and Tome of Fate).
 *
 * Pure-rules engine. Each mechanic is a small, named function with no
 * DataModel coupling, no actor lookups, no Foundry imports. The caller
 * (sheet, chat card, weapon-fire pipeline, initiative HUD) owns I/O and
 * state persistence; this module owns only the per-mechanic arithmetic.
 *
 * Canonical rules referenced here:
 *   - Irradiated(X) weapon quality (decay.md :1007): on a successful
 *     hit, the target suffers `X` damage per tick for `X` further ticks
 *     (typically rounds) as radiation eats through armour.
 *   - Overcharge weapon quality (excess.md :945): damage of a successful
 *     hit is doubled, but if the firer's Chaos Alignment is Untested or
 *     worse the weapon jams (Overcharge is the canonical "double-edged
 *     sword" of slaaneshi pleasure-tech).
 *   - Legacy Weapons (blood.md :1524): named weapons whose power scales
 *     with kills. Threshold tiers at 10 / 25 / 50 kills mark the points
 *     where the weapon's profile improves.
 *   - Daemon Engine(X) trait (decay.md :1379-1391): rage accumulates
 *     while the engine has not received damage, capped by the trait's
 *     rating. Bonus = rating + min(turnsSinceLastDamage, rating).
 *   - Quick and the Dead trait (fate.md :669): a Tzeentch-touched
 *     initiative perk. Khorne+Slaanesh push for the kill (+10);
 *     Tzeentch and the Unaligned get +5; Nurgle does not benefit.
 *
 * Per Direction #7 of CLAUDE.md the rating numbers and per-weapon
 * specifics (which weapons carry Irradiated, which Legacy thresholds a
 * specific named blade reaches at tier 3, etc.) are authored in
 * compendium `_source/*.json` documents. This module owns only the
 * resolution logic over those structured fields.
 */

/* -------------------------------------------- */
/*  Irradiated(X) weapon quality                */
/* -------------------------------------------- */

/**
 * State carried on a target who has been hit by an Irradiated(X) weapon.
 * `rating` is the X value from the weapon's profile (damage per tick).
 * `ticksRemaining` is how many further ticks of irradiation damage are
 * still pending; this counts down as {@link applyIrradiatedTick} is
 * called each turn.
 */
export interface IrradiatedHit {
    /** Irradiation rating (X) — damage applied per tick. */
    rating: number;
    /** Number of further ticks of irradiation damage still to apply. */
    ticksRemaining: number;
}

/** Result shape returned by {@link applyIrradiatedTick}. */
export interface IrradiatedTickResult {
    /** The post-tick state, with `ticksRemaining` decremented by one. */
    newState: IrradiatedHit;
    /** Damage applied by this tick (0 if no ticks were remaining). */
    damage: number;
}

/**
 * Advance an {@link IrradiatedHit} by one tick.
 *
 * - When `ticksRemaining > 0`: applies `rating` damage and decrements
 *   `ticksRemaining` by one.
 * - When `ticksRemaining <= 0`: applies 0 damage and clamps the
 *   remaining tick count to 0 (irradiation has worn off).
 *
 * Non-finite or negative inputs are sanitised to 0. Fractional inputs
 * are truncated so the state remains integer-typed.
 */
export function applyIrradiatedTick(state: IrradiatedHit): IrradiatedTickResult {
    const rating = sanitiseNonNegativeInt(state.rating);
    const ticks = sanitiseNonNegativeInt(state.ticksRemaining);
    if (ticks <= 0) {
        return {
            newState: { rating, ticksRemaining: 0 },
            damage: 0,
        };
    }
    return {
        newState: { rating, ticksRemaining: ticks - 1 },
        damage: rating,
    };
}

/* -------------------------------------------- */
/*  Overcharge weapon quality                   */
/* -------------------------------------------- */

/** Result shape returned by {@link resolveOverchargedShot}. */
export interface OverchargeOutcome {
    /**
     * Multiplier applied to the rolled damage of the hit. RAW says a
     * successful Overcharged shot deals double damage; a jammed weapon
     * deals none (the shot never fires).
     */
    effectiveDamageMultiplier: 1 | 2;
    /**
     * True if the weapon jammed before discharging. Jamming pre-empts
     * the damage doubling — a jam IS the failure mode of Overcharge.
     */
    jammed: boolean;
}

/** Input shape for {@link resolveOverchargedShot}. */
export interface OverchargedShotArgs {
    /**
     * Whether the firer's Chaos Alignment is at "Untested" (or worse)
     * status. Per excess.md :945, Untested+ firers cannot safely contain
     * the slaaneshi feedback and the weapon jams.
     */
    untested: boolean;
}

/**
 * Resolve a single Overcharged shot.
 *
 * - If `untested` is true → `jammed: true`, multiplier `1` (the jam
 *   pre-empts the damage step entirely; the caller is expected to
 *   suppress damage application when `jammed` is set).
 * - Otherwise → `jammed: false`, multiplier `2`.
 */
export function resolveOverchargedShot(args: OverchargedShotArgs): OverchargeOutcome {
    if (args.untested) {
        return { effectiveDamageMultiplier: 1, jammed: true };
    }
    return { effectiveDamageMultiplier: 2, jammed: false };
}

/* -------------------------------------------- */
/*  Legacy Weapons                              */
/* -------------------------------------------- */

/**
 * Tier ladder for a Legacy Weapon. Each step represents the named blade
 * (or gun, or daemon-bound thing) growing in power as it racks up
 * kills. The thresholds are authored RAW.
 */
export type LegacyWeaponTier = 0 | 1 | 2 | 3;

/** State carried on a Legacy Weapon's item document. */
export interface LegacyWeaponState {
    /** Total confirmed kills attributed to this weapon. */
    kills: number;
    /** Current tier — derived from `kills` via the threshold table. */
    tier: LegacyWeaponTier;
}

/**
 * RAW thresholds at which a Legacy Weapon's tier advances. The order
 * is significant: index `i` is the kill count needed to be AT tier
 * `i + 1` (so 10 kills → tier 1, 25 → tier 2, 50 → tier 3).
 */
export const LEGACY_WEAPON_TIER_THRESHOLDS: readonly [number, number, number] = [10, 25, 50];

/**
 * Compute the tier for a given kill count. Pure helper exported for
 * tests / UI display. Non-finite or negative inputs collapse to tier 0.
 */
export function legacyWeaponTierForKills(kills: number): LegacyWeaponTier {
    const k = sanitiseNonNegativeInt(kills);
    if (k >= LEGACY_WEAPON_TIER_THRESHOLDS[2]) return 3;
    if (k >= LEGACY_WEAPON_TIER_THRESHOLDS[1]) return 2;
    if (k >= LEGACY_WEAPON_TIER_THRESHOLDS[0]) return 1;
    return 0;
}

/**
 * Add a count of new kills to a Legacy Weapon's state, auto-advancing
 * its tier when a threshold is crossed. Returns a fresh object — the
 * caller decides whether to persist the new state to the item document.
 *
 * Non-finite or negative `killCount` values are sanitised to 0 (no-op).
 * The returned `tier` is recomputed from the new kill total, never
 * inherited blindly from the input — this protects against drift if
 * the persisted tier was tampered with out-of-band.
 */
export function incrementLegacyWeaponKills(state: LegacyWeaponState, killCount: number): LegacyWeaponState {
    const priorKills = sanitiseNonNegativeInt(state.kills);
    const delta = sanitiseNonNegativeInt(killCount);
    const newKills = priorKills + delta;
    return {
        kills: newKills,
        tier: legacyWeaponTierForKills(newKills),
    };
}

/* -------------------------------------------- */
/*  Daemon Engine(X) trait                      */
/* -------------------------------------------- */

/** Input shape for {@link daemonEngineRageBonus}. */
export interface DaemonEngineRageArgs {
    /** The X value of the Daemon Engine(X) trait. */
    rating: number;
    /**
     * Number of turns since the engine last took damage. RAW: rage
     * builds while idle and peaks at the rating value.
     */
    turnsSinceLastDamage: number;
}

/**
 * Compute the Daemon Engine(X) rage bonus.
 *
 * Bonus = rating + min(turnsSinceLastDamage, rating).
 *
 * The two-term formula matches RAW: a Daemon Engine always benefits
 * from at least `rating` worth of rage (the baseline daemonic fury),
 * and gains a matching idle-rage bonus that ramps up turn-by-turn until
 * it caps at `rating`. Taking damage resets `turnsSinceLastDamage` to 0
 * at the caller's discretion, dropping the bonus back to `rating`.
 *
 * Non-finite or negative inputs are sanitised to 0.
 */
export function daemonEngineRageBonus(args: DaemonEngineRageArgs): number {
    const rating = sanitiseNonNegativeInt(args.rating);
    const idle = sanitiseNonNegativeInt(args.turnsSinceLastDamage);
    return rating + Math.min(idle, rating);
}

/* -------------------------------------------- */
/*  Quick and the Dead trait                    */
/* -------------------------------------------- */

/**
 * Alignment input accepted by {@link quickAndTheDeadInitiativeBonus}.
 * Mirrors the four Ruinous Powers plus the Unaligned state — the
 * supplement-mechanics layer keeps this local rather than importing the
 * project-wide `ChaosAlignment` to stay decoupled from the config tree
 * (this module is pure-rules and has no other config dependency).
 */
export type QuickAndTheDeadAlignment = 'khorne' | 'slaanesh' | 'nurgle' | 'tzeentch' | 'unaligned';

/**
 * Per-alignment initiative bonus granted by the Quick and the Dead
 * trait. RAW: Khorne and Slaanesh push for the killing blow (+10);
 * Tzeentch and the Unaligned benefit from the trait's foresight (+5);
 * Nurgle, slow and inevitable, gains nothing.
 */
export const QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT: Readonly<Record<QuickAndTheDeadAlignment, number>> = {
    khorne: 10,
    slaanesh: 10,
    nurgle: 0,
    tzeentch: 5,
    unaligned: 5,
};

/**
 * Resolve the post-bonus initiative score for a character with the
 * Quick and the Dead trait.
 *
 * Returns `baseInitiative + bonus`, where `bonus` comes from
 * {@link QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT}. Non-finite or negative
 * `baseInitiative` collapses to 0 before the bonus is added.
 */
export function quickAndTheDeadInitiativeBonus(baseInitiative: number, alignment: QuickAndTheDeadAlignment): number {
    const base = sanitiseNonNegativeInt(baseInitiative);
    const bonus = QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT[alignment];
    return base + bonus;
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}
