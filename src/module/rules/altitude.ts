/**
 * Flyer altitude rules (without.md p. 54-55).
 *
 * Four tiers govern minimum movement, descent/climb constraints, and
 * targeting penalties for shooting at the Flyer. Aerial-manoeuvre
 * combat actions (Lock On / Tight Turn) are registered in
 * `rules/vehicle-actions.ts`.
 */

export type Altitude = 'ground' | 'low' | 'high' | 'orbital';

export interface AltitudeProfile {
    altitude: Altitude;
    label: string;
    /** Targeting modifier applied to shots fired at this altitude. */
    rangedAttackModifier: number;
    /** Minimum movement per turn (metres). 0 means no minimum. */
    minimumMovementMetres: number;
    /** Adjacent altitudes the vehicle may climb/descend to in one full turn. */
    adjacentAltitudes: Altitude[];
}

/** Altitude tiers in ascending order — the canonical climb/descent ladder. */
export const ALTITUDE_ORDER: readonly Altitude[] = ['ground', 'low', 'high', 'orbital'];

export const ALTITUDE_PROFILES: Record<Altitude, AltitudeProfile> = {
    ground: { altitude: 'ground', label: 'Ground (0–2m)', rangedAttackModifier: 0, minimumMovementMetres: 0, adjacentAltitudes: ['low'] },
    low: { altitude: 'low', label: 'Low altitude (3–50m)', rangedAttackModifier: -10, minimumMovementMetres: 0, adjacentAltitudes: ['ground', 'high'] },
    high: { altitude: 'high', label: 'High altitude (50m+)', rangedAttackModifier: -30, minimumMovementMetres: 50, adjacentAltitudes: ['low', 'orbital'] },
    orbital: { altitude: 'orbital', label: 'Orbital', rangedAttackModifier: -60, minimumMovementMetres: 0, adjacentAltitudes: ['high'] },
};

/** Can a Flyer transition between these two altitudes in one full turn? */
export function canChangeAltitude(from: Altitude, to: Altitude): boolean {
    if (from === to) return true;
    return ALTITUDE_PROFILES[from].adjacentAltitudes.includes(to);
}

/**
 * Flat penalty for shooting *at* an airborne Flyer, on top of any other
 * modifiers (without.md p. 54, L1605). This is the −20 the Without
 * supplement adds specifically for the target being an airborne flyer;
 * it is distinct from — and stacks with — the per-altitude
 * `rangedAttackModifier` already encoded in {@link ALTITUDE_PROFILES}.
 */
export const FLYER_AIRBORNE_FIRE_PENALTY = -20;

/** Where the shot is being fired from / at, for the firing-penalty composer. */
export type FirePosition = 'ground' | 'airborne';

export interface FlyerFireResolution {
    /** Combined Ballistic-Skill modifier to apply to the shot (signed). */
    modifier: number;
    /**
     * `true` when ground forces cannot legally target the flyer at all
     * (High / Orbital altitude, per without.md L1605) — the modifier is
     * then moot; the GM should reject the shot unless the shooter has a
     * special ability allowing it.
     */
    untargetable: boolean;
    /** Per-altitude component (reused from {@link ALTITUDE_PROFILES}). */
    altitudeModifier: number;
    /** The flat airborne-flyer penalty component, if it applied. */
    airbornePenalty: number;
}

/**
 * Compose the Ballistic-Skill modifier for a shot *at* a Flyer, reusing
 * the per-altitude table in {@link ALTITUDE_PROFILES} and layering the
 * Without −20 airborne-flyer penalty on top (without.md p. 54).
 *
 * - The flyer's altitude profile contributes its `rangedAttackModifier`.
 * - When the flyer is airborne (not at Ground), the flat
 *   {@link FLYER_AIRBORNE_FIRE_PENALTY} is added.
 * - When the flyer is at High or Orbital altitude **and the shooter is
 *   on the ground**, the flyer is `untargetable` by ordinary means.
 *
 * Pure: no Foundry, no I/O. The DH2/Without gating (only Flyer-trait
 * vehicles use this) is the caller's responsibility — the math is
 * system-agnostic so the other six lines don't regress.
 */
export function resolveFlyerFireModifier(targetAltitude: Altitude, shooterPosition: FirePosition = 'ground'): FlyerFireResolution {
    const profile = ALTITUDE_PROFILES[targetAltitude];
    const altitudeModifier = profile.rangedAttackModifier;
    const isAirborne = targetAltitude !== 'ground';
    const airbornePenalty = isAirborne ? FLYER_AIRBORNE_FIRE_PENALTY : 0;
    const untargetable = shooterPosition === 'ground' && (targetAltitude === 'high' || targetAltitude === 'orbital');
    return {
        modifier: altitudeModifier + airbornePenalty,
        untargetable,
        altitudeModifier,
        airbornePenalty,
    };
}
