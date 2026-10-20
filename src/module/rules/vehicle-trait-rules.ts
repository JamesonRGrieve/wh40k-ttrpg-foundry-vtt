/**
 * @file vehicle-trait-rules — the read-only rows the craft sheet's Trait Rules
 * panel shows (content#28): the movement, terrain and deployment rules a
 * vehicle's traits give it, read off the aggregated `system.traitEffects`.
 *
 * Pure: the sheet localises each row's key and value, so this is unit-tested
 * without Foundry. Damage and crit handling are deliberately absent; they belong
 * to the damage pipeline, not this panel.
 */

import type { AggregatedVehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import type { I18nKey } from '../types/i18n-keys';

/** The rule flags the panel lists, in display order. */
const FLAG_ROWS = [
    'immobile',
    'ponderous',
    'enhancedMovement',
    'hoverer',
    'flyer',
    'spacecraft',
    'ignoresDifficultTerrain',
    'amphibious',
    'freeTurn',
    'cannotRam',
    'crashesOnFailedRam',
    'hitAndRun',
    'canParryWithMelee',
    'orbitalDeployment',
    'environmentallySealed',
] as const satisfies ReadonlyArray<keyof AggregatedVehicleTraitEffects>;

/** The signed modifiers the panel lists, shown only when non-zero. */
const MODIFIER_ROWS = ['incomingRangedToHitModifier', 'incomingMeleeToHitModifier', 'deploymentIncomingToHitModifier'] as const satisfies ReadonlyArray<
    keyof AggregatedVehicleTraitEffects
>;

/** One row of the panel: the label key, and for a valued row the value to format into it. */
interface VehicleTraitRuleRow {
    key: string;
    labelKey: I18nKey;
    /** The value a valued row formats into its label; a localisation key when `valueIsKey`. */
    value?: string;
    valueIsKey?: boolean;
}

/** A signed modifier as the card prints it: `+10`, `−20`. */
export function signedModifier(value: number): string {
    return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** The panel rows for a craft's aggregated trait effects; empty when the traits give no such rules. */
export function vehicleTraitRuleRows(effects: AggregatedVehicleTraitEffects): VehicleTraitRuleRow[] {
    const rows: VehicleTraitRuleRow[] = [];
    if (effects.crewExposure !== '') {
        rows.push({
            key: 'crewExposure',
            labelKey: 'WH40K.Vehicle.TraitRules.Value.crewExposure',
            value: `WH40K.Vehicle.TraitRules.CrewExposure.${effects.crewExposure}`,
            valueIsKey: true,
        });
    }
    for (const flag of FLAG_ROWS) {
        if (effects[flag]) rows.push({ key: flag, labelKey: `WH40K.Vehicle.TraitRules.Flag.${flag}` });
    }
    for (const modifier of MODIFIER_ROWS) {
        const value = effects[modifier];
        if (value !== 0) rows.push({ key: modifier, labelKey: `WH40K.Vehicle.TraitRules.Value.${modifier}`, value: signedModifier(value) });
    }
    if (effects.postLandingDelayRounds > 0) {
        rows.push({
            key: 'postLandingDelayRounds',
            labelKey: 'WH40K.Vehicle.TraitRules.Value.postLandingDelayRounds',
            value: String(effects.postLandingDelayRounds),
        });
    }
    if (effects.antiAir !== '') {
        rows.push({
            key: 'antiAir',
            labelKey: 'WH40K.Vehicle.TraitRules.Value.antiAir',
            value: `WH40K.Vehicle.TraitRules.AntiAir.${effects.antiAir}`,
            valueIsKey: true,
        });
    }
    return rows;
}
