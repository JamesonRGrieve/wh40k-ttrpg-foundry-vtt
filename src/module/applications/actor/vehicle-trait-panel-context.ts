/**
 * @file vehicle-trait-panel-context — the render context of the craft sheet's
 * Vehicle Tests and Trait Rules panels (content#28), built from the craft's
 * aggregated trait effects. Pure apart from the injected localiser, so the
 * sheet and its stories build the panel the same way.
 */

import type { AggregatedVehicleTraitEffects } from '../../data/shared/vehicle-trait-effects-template.ts';
import { signedModifier, vehicleTraitRuleRows } from '../../rules/vehicle-trait-rules.ts';
import { VEHICLE_TEST_CATEGORIES, type VehicleTestCategory, vehicleTraitTestComponents } from '../../rules/vehicle-trait-tests.ts';

/** One vehicle test button and the trait modifiers that test takes. */
interface PreparedVehicleTest {
    category: VehicleTestCategory;
    label: string;
    rollLabel: string;
    modifiers: Array<{ label: string; value: string }>;
}

/** The Vehicle Tests + Trait Rules panels' context. */
export interface VehicleTraitPanelContext {
    tests: PreparedVehicleTest[];
    rules: Array<{ key: string; text: string }>;
}

/** The localiser the panel reads (`game.i18n` at runtime, the langpack in stories). */
interface PanelLocaliser {
    localize: (key: string) => string;
    format: (key: string, data: Record<string, string>) => string;
}

/** Build the panels' context for a craft's aggregated trait effects. */
export function buildVehicleTraitPanel(effects: AggregatedVehicleTraitEffects, i18n: PanelLocaliser): VehicleTraitPanelContext {
    const tests = VEHICLE_TEST_CATEGORIES.map((category) => {
        const label = i18n.localize(`WH40K.Vehicle.TraitTests.Category.${category}`);
        return {
            category,
            label,
            rollLabel: i18n.format('WH40K.Vehicle.TraitTests.Roll', { test: label }),
            modifiers: vehicleTraitTestComponents(effects.testModifiers, category, (trait) => trait).map((row) => ({
                label: row.label,
                value: signedModifier(row.value),
            })),
        };
    });
    const rules = vehicleTraitRuleRows(effects).map((row) => ({
        key: row.key,
        text:
            row.value === undefined
                ? i18n.localize(row.labelKey)
                : i18n.format(row.labelKey, { value: row.valueIsKey === true ? i18n.localize(row.value) : row.value }),
    }));
    return { tests, rules };
}
