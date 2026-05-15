/**
 * Vehicle / mount combat-action catalogue
 * (core.md §"Vehicle Combat Actions", p. 251).
 *
 * Parallel registry to `combat-actions.ts` — these actions surface on
 * a vehicle's action bar (driver / pilot) rather than on a personal
 * combatant.
 */

export interface VehicleAction {
    name: string;
    /** Time cost (Half / Full / Free / Reaction). */
    type: ('Half' | 'Full' | 'Free' | 'Reaction')[];
    /** Category for filtering / icon assignment. */
    subtype: string[];
    description: string;
    /** Optional skill associated with this action (driver test). */
    skill?: string;
    /** Optional flat test modifier when the action is invoked. */
    modifier?: number;
}

export const VEHICLE_ACTIONS: VehicleAction[] = [
    {
        name: 'Manoeuvre',
        type: ['Half'],
        subtype: ['Operate'],
        description: "Adjust the vehicle's heading or position within its movement allowance. No skill test required for routine manoeuvres.",
    },
    {
        name: 'Pull Stunt',
        type: ['Full'],
        subtype: ['Operate', 'Risky'],
        description:
            'Attempt a daring manoeuvre (handbrake turn, jump a ravine, ram a barricade). Operate (matching vehicle class) test at GM-set difficulty; on 3+ DoF the vehicle goes Out of Control.',
        skill: 'operate',
    },
    {
        name: 'Ram',
        type: ['Full'],
        subtype: ['Attack', 'Operate'],
        description:
            'Drive the vehicle bodily into a target. Operate test to land; on success target takes (1d10 + vehicle Size + speed bonus) impact damage and the vehicle takes the same back at its facing armour. Inverse: ramming a vehicle of equal/greater size sends the attacker out of control.',
        skill: 'operate',
    },
    {
        name: 'Disengage',
        type: ['Full'],
        subtype: ['Operate', 'Defensive'],
        description:
            "Break off from a melee or pursuit. Operate test against the pursuer's opposed Operate; on success the vehicle exits engagement with no opportunity attacks.",
        skill: 'operate',
    },
    {
        name: 'Hot-Wire',
        type: ['Full'],
        subtype: ['Operate', 'Miscellaneous'],
        description:
            'Force-start a vehicle without proper authorisation or recover a stalled engine. Tech-Use (matching vehicle class) test; difficulty per vehicle complexity. Failure leaves the engine cold for the round.',
        skill: 'techUse',
    },
    {
        name: 'Suppress Fire (Vehicle)',
        type: ['Full'],
        subtype: ['Attack', 'Vehicle Weapon'],
        description:
            'Use a vehicle-mounted weapon to suppress an area. Functions identically to the personal Suppressing Fire — Full action; gunner makes a BS test at −20 in a 45° arc; affected enemies must pass a Hard (−20) Pinning test.',
        modifier: -20,
    },
    {
        name: 'Lock On',
        type: ['Half'],
        subtype: ['Aerial', 'Operate'],
        description:
            'Acquire a target lock for a Flyer-mounted weapon. Operate (Aeronautica) test; success grants +20 BS to the next attack with that weapon. Required precursor to certain missile fire modes.',
        skill: 'operate',
        modifier: 20,
    },
    {
        name: 'Tight Turn',
        type: ['Half'],
        subtype: ['Aerial', 'Operate'],
        description:
            "Execute a sharp aerial change of heading. Operate (Aeronautica) test at the vehicle's Manoeuvrability; failure forces a Stall outcome on the Out of Control table.",
        skill: 'operate',
    },
];

/** Return all canonical vehicle-action names. */
export function getVehicleActionNames(): readonly string[] {
    return VEHICLE_ACTIONS.map((a) => a.name);
}

/** Look up a vehicle action by name (case-sensitive, exact match). */
export function getVehicleAction(name: string): VehicleAction | undefined {
    return VEHICLE_ACTIONS.find((a) => a.name === name);
}
