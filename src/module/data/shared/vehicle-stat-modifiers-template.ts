/**
 * @file Shared vehicle-stat modifier helpers
 * Single-sources the four-field vehicle-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` derivations (including the `formatted`
 * signed string) shared by vehicle-trait and vehicle-upgrade.
 *
 * The schema + helper logic is the shared {@link makeStatModifiers} factory
 * (#346); this file only pins the vehicle key set, i18n prefix, and the
 * `includeFormatted` flag (a caller — `vehicle-upgrade.ts` — reads the signed
 * `formatted` string). Exposed as schema + pure helper functions (mirroring
 * `body-locations.ts`) rather than a DataModel mixin class:
 * `SystemDataModel.mixin(...)` merges `defineSchema()` and the lifecycle hooks
 * but does not surface a template's instance getters on the composed type, so
 * each consumer keeps thin local `hasModifiers` / `modifiersList` getters that
 * delegate to these helpers.
 */
import { makeStatModifiers, type FormattedStatModifierEntry } from './stat-modifiers-factory.ts';

/** The four vehicle stats a trait / upgrade can modify, in canonical order. */
export const VEHICLE_STAT_KEYS = ['speed', 'manoeuvrability', 'armour', 'integrity'] as const;

/** Structured shape of the vehicle-stat modifier block. */
export type VehicleStatModifiers = Record<(typeof VEHICLE_STAT_KEYS)[number], number>;

/** One rendered, non-zero vehicle-stat modifier for display (with signed `formatted`). */
export type VehicleModifierEntry = FormattedStatModifierEntry;

const helpers = makeStatModifiers(VEHICLE_STAT_KEYS, 'WH40K.VehicleStat', { includeFormatted: true });

/**
 * Build the shared four-field vehicle-stat `modifiers` SchemaField.
 * @returns {SchemaField}
 */
export const vehicleStatModifiersSchema = helpers.schema;

/** Has any non-zero vehicle-stat modifier? */
export const vehicleHasModifiers = helpers.hasModifiers;

/** The non-zero vehicle-stat modifiers as a localized display list. */
export const vehicleModifiersList = helpers.modifiersList;
