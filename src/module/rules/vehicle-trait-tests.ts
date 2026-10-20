/**
 * @file vehicle-trait-tests — Path B: what a vehicle's traits add to the tests
 * made with it (content#28).
 *
 * A trait's per-test bonus (Rugged: +20 to repair it; Tracked Vehicle: +10 to
 * tests in difficult terrain) is authored
 * as data on the trait (`effects.testModifiers`) and aggregated onto the craft's
 * `system.traitEffects`, each entry naming its trait. This module turns the
 * entries for one test category into sourced rows in the `vehicle-traits` bucket,
 * which sums into the target and expands on the card with one row per trait.
 *
 * It also picks the skill each category tests and the crew member who makes the
 * test. Vehicles have no skills of their own: every vehicle test is a skill test
 * of a character aboard.
 */

import type { SourcedVehicleTestModifier } from '../data/shared/vehicle-trait-effects-template.ts';
import type { VehicleRole } from './vehicle-occupancy.ts';

/** The roll-modifier bucket vehicle-trait test modifiers are summed under. */
export const VEHICLE_TRAIT_TEST_BUCKET = 'vehicle-traits';

/** The test categories a trait's `testModifiers[].test` can name. */
export const VEHICLE_TEST_CATEGORIES = ['repair', 'difficultTerrain', 'floorIt', 'command'] as const;
export type VehicleTestCategory = (typeof VEHICLE_TEST_CATEGORIES)[number];

/** Type guard over the category id space (a sheet button's `data-test`). */
export function isVehicleTestCategory(value: string): value is VehicleTestCategory {
    return (VEHICLE_TEST_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The skill each category tests, in preference order. Repairs are Tech-Use and
 * Command is Command in every line. Driving is Operate in the aptitude lines (DH2,
 * OW) and Drive or Pilot in the career lines (DH1, RT, DW, BC); the tester's first
 * one present is used.
 */
const CATEGORY_SKILLS: Readonly<Record<VehicleTestCategory, readonly [string, ...string[]]>> = {
    repair: ['techUse'],
    difficultTerrain: ['operate', 'drive', 'pilot'],
    floorIt: ['operate', 'drive', 'pilot'],
    command: ['command'],
};

/**
 * The skill key the category tests for a tester who has the skills `has` reports:
 * the first candidate present, else the first candidate (so the test still rolls,
 * untrained, against the line's printed skill).
 */
export function vehicleTestSkill(category: VehicleTestCategory, has: (skillKey: string) => boolean): string {
    const candidates = CATEGORY_SKILLS[category];
    return candidates.find(has) ?? candidates[0];
}

/**
 * The seats asked to make the category's test, in order. The driver drives and,
 * with no commander seat in the occupancy model, commands ("the Commander, or the
 * Driver if there is no Commander", OW Core p. 212); crew make repairs.
 */
const CATEGORY_SEATS: Readonly<Record<VehicleTestCategory, readonly VehicleRole[]>> = {
    repair: ['crew', 'driver', 'gunner'],
    difficultTerrain: ['driver', 'crew', 'gunner'],
    floorIt: ['driver', 'crew', 'gunner'],
    command: ['driver', 'crew', 'gunner'],
};

/** The aboard character who makes the category's test, or `undefined` when no seat is filled. */
export function vehicleTester<T>(category: VehicleTestCategory, occupants: readonly { actor: T; role: VehicleRole }[]): T | undefined {
    for (const seat of CATEGORY_SEATS[category]) {
        const found = occupants.find((occupant) => occupant.role === seat);
        if (found !== undefined) return found.actor;
    }
    return undefined;
}

/** One sourced row — structurally a `RollModifierComponent`. */
interface VehicleTraitTestComponent {
    key: string;
    label: string;
    value: number;
    source: string;
}

/**
 * The rows the craft's traits add to a test of `category`: one per trait entry
 * naming it, zero-valued entries skipped. `source` is resolved by the caller (the
 * localised "Vehicle trait (X)" phrase).
 */
export function vehicleTraitTestComponents(
    testModifiers: readonly SourcedVehicleTestModifier[],
    category: VehicleTestCategory,
    describeSource: (traitName: string) => string,
): VehicleTraitTestComponent[] {
    return testModifiers
        .filter((entry) => entry.test === category && entry.value !== 0)
        .map((entry, index) => ({
            key: `vehicle-trait-${category}-${index}`,
            label: entry.source,
            value: entry.value,
            source: describeSource(entry.source),
        }));
}
