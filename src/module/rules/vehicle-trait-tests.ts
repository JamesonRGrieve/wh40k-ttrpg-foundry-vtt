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
 * of a character aboard, and a driving test uses the specialisation the line
 * prints for the craft's locomotion (its config's `vehicleDriving`).
 */

import type { Locomotion } from '../data/actor/vehicle.ts';
import type { SourcedVehicleTestModifier } from '../data/shared/vehicle-trait-effects-template.ts';
import type { VehicleRole } from './vehicle-occupancy.ts';
import type { ModificationSkill } from './weapon-modification.ts';

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
 * A skill a line prints for a vehicle test, narrowed to the specialisation the
 * book names (`Operate (Surface)`), or null for a standard skill. The same shape
 * as a weapon-modification skill.
 */
export type VehicleTestSkill = ModificationSkill;

/**
 * The skill a line's driver tests for each means of locomotion, as its skill
 * chapter prints it: Operate (Surface / Aeronautica / Voidship) in the aptitude
 * lines, Drive or Pilot and their skill groups in the career lines. `null` where
 * the line prints no skill for that kind of craft.
 */
export type VehicleDrivingRules = Readonly<Record<Locomotion, VehicleTestSkill | null>>;

/** Repairs are Tech-Use and Command is Command in every line. */
const REPAIR_SKILL: VehicleTestSkill = { skill: 'techUse', specialisation: null };
const COMMAND_SKILL: VehicleTestSkill = { skill: 'command', specialisation: null };

/**
 * The skill (and specialisation) a test of `category` takes on a craft with the
 * given locomotion, under the line's printed driving rules. A driving test with
 * no printed skill for that craft (or for a line without driving rules) is null.
 */
export function vehicleTestSkill(category: VehicleTestCategory, locomotion: Locomotion, driving: VehicleDrivingRules | null): VehicleTestSkill | null {
    if (category === 'repair') return REPAIR_SKILL;
    if (category === 'command') return COMMAND_SKILL;
    return driving?.[locomotion] ?? null;
}

/**
 * The seats asked to make the category's test, in order. The driver drives and,
 * with no commander seat in the occupancy model, commands ("the Commander, or the
 * Driver if there is no Commander", OW rules); crew make repairs.
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
