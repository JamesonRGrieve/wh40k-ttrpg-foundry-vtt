/**
 * @file A grenade rider (#135, #623) for tests and stories, built from the fields a case
 * cares about. Every unset field takes the DataModel's initial: no test, everyone
 * affected, no condition, the Blast's radius, no printed duration, no effect-roll step.
 */

import type { GrenadeRiderData } from '../rules/grenade-rider.ts';

/** The rider fields a case sets; `test` may set any of its parts. */
export type RiderOverrides = Partial<Omit<GrenadeRiderData, 'test'>> & { test?: Partial<GrenadeRiderData['test']> };

/** A whole rider: the DataModel's initials under `overrides`. */
export function riderFixture(overrides: RiderOverrides = {}): GrenadeRiderData {
    const { test, ...rest } = overrides;
    return {
        affects: '',
        condition: '',
        area: { size: '', measure: 'radius' },
        duration: { kind: '', base: 0, formula: '' },
        effectRollShift: { perDegree: 0, max: 0 },
        characteristicDamage: { characteristic: '', formula: '', perDegree: 0 },
        effect: 'The effect.',
        ...rest,
        test: { characteristic: '', modifier: 0, psykerModifier: 0, ...test },
    };
}
