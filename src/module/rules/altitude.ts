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
