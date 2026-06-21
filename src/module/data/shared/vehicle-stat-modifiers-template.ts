/**
 * @file Shared vehicle-stat modifier helpers
 * Single-sources the four-field vehicle-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` derivations (including the `formatted`
 * signed string) shared by vehicle-trait and vehicle-upgrade.
 *
 * Exposed as schema + pure helper functions (mirroring `body-locations.ts`)
 * rather than a DataModel mixin class: `SystemDataModel.mixin(...)` merges
 * `defineSchema()` and the lifecycle hooks but does not surface a template's
 * instance getters on the composed type, so each consumer keeps thin local
 * `hasModifiers` / `modifiersList` getters that delegate to these helpers.
 */
import { formatSigned } from '../../utils/format.ts';

/** The four vehicle stats a trait / upgrade can modify, in canonical order. */
export const VEHICLE_STAT_KEYS = ['speed', 'manoeuvrability', 'armour', 'integrity'] as const;

/** Structured shape of the vehicle-stat modifier block. */
export type VehicleStatModifiers = Record<(typeof VEHICLE_STAT_KEYS)[number], number>;

/** One rendered, non-zero vehicle-stat modifier for display. */
export interface VehicleModifierEntry {
    key: string;
    label: string;
    value: number;
    formatted: string;
}

/**
 * Build the shared four-field vehicle-stat `modifiers` SchemaField.
 * @returns {SchemaField}
 */
export function vehicleStatModifiersSchema(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    const block: Record<string, foundry.data.fields.DataField.Any> = {};
    for (const key of VEHICLE_STAT_KEYS) {
        block[key] = new fields.NumberField({ required: true, initial: 0, integer: true });
    }
    return new fields.SchemaField(block);
}

/** Has any non-zero vehicle-stat modifier? */
export function vehicleHasModifiers(modifiers: VehicleStatModifiers): boolean {
    return Object.values(modifiers).some((v) => v !== 0);
}

/** The non-zero vehicle-stat modifiers as a localized display list. */
export function vehicleModifiersList(modifiers: VehicleStatModifiers): VehicleModifierEntry[] {
    const list: VehicleModifierEntry[] = [];
    for (const [key, value] of Object.entries(modifiers)) {
        if (value !== 0) {
            list.push({
                key,
                label: game.i18n.localize(`WH40K.VehicleStat.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
                value,
                formatted: `${formatSigned(value)}`,
            });
        }
    }
    return list;
}
