/**
 * @file Shared ship-stat modifier helpers
 * Single-sources the nine-field ship-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` derivations shared by ship-component and
 * ship-upgrade. Adding or renaming a ship stat is a single edit here.
 *
 * The schema + helper logic is the shared {@link makeStatModifiers} factory
 * (#346); this file only pins the ship key set and i18n prefix. Exposed as
 * schema + pure helper functions (mirroring `body-locations.ts`) rather than a
 * DataModel mixin class: `SystemDataModel.mixin(...)` merges `defineSchema()`
 * and the lifecycle hooks but does not surface a template's instance getters on
 * the composed type, so each consumer keeps thin local `hasModifiers` /
 * `modifiersList` getters that delegate to these helpers.
 */
import { makeStatModifiers, type StatModifierEntry } from './stat-modifiers-factory.ts';

/** The nine ship stats a component / upgrade can modify, in canonical order. */
export const SHIP_STAT_KEYS = [
    'speed',
    'manoeuvrability',
    'detection',
    'armour',
    'hullIntegrity',
    'turretRating',
    'voidShields',
    'morale',
    'crewRating',
] as const;

/** Structured shape of the ship-stat modifier block. */
export type ShipStatModifiers = Record<(typeof SHIP_STAT_KEYS)[number], number>;

/** One rendered, non-zero ship-stat modifier for display. */
export type ShipModifierEntry = StatModifierEntry;

const helpers = makeStatModifiers(SHIP_STAT_KEYS, 'WH40K.ShipStat');

/**
 * Build the shared nine-field ship-stat `modifiers` SchemaField.
 * @returns {SchemaField}
 */
export const shipStatModifiersSchema = helpers.schema;

/** Has any non-zero ship-stat modifier? */
export const shipHasModifiers = helpers.hasModifiers;

/** The non-zero ship-stat modifiers as a localized display list. */
export const shipModifiersList = helpers.modifiersList;
