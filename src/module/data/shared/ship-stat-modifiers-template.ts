/**
 * @file Shared ship-stat modifier helpers
 * Single-sources the nine-field ship-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` derivations shared by ship-component and
 * ship-upgrade. Adding or renaming a ship stat is a single edit here.
 *
 * Exposed as schema + pure helper functions (mirroring `body-locations.ts`)
 * rather than a DataModel mixin class: `SystemDataModel.mixin(...)` merges
 * `defineSchema()` and the lifecycle hooks but does not surface a template's
 * instance getters on the composed type, so each consumer keeps thin local
 * `hasModifiers` / `modifiersList` getters that delegate to these helpers.
 */

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
export interface ShipModifierEntry {
    key: string;
    label: string;
    value: number;
}

/**
 * Build the shared nine-field ship-stat `modifiers` SchemaField.
 * @returns {SchemaField}
 */
export function shipStatModifiersSchema(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    const block: Record<string, foundry.data.fields.DataField.Any> = {};
    for (const key of SHIP_STAT_KEYS) {
        block[key] = new fields.NumberField({ required: true, initial: 0, integer: true });
    }
    return new fields.SchemaField(block);
}

/** Has any non-zero ship-stat modifier? */
export function shipHasModifiers(modifiers: ShipStatModifiers): boolean {
    return Object.values(modifiers).some((v) => v !== 0);
}

/** The non-zero ship-stat modifiers as a localized display list. */
export function shipModifiersList(modifiers: ShipStatModifiers): ShipModifierEntry[] {
    const list: ShipModifierEntry[] = [];
    for (const [key, value] of Object.entries(modifiers)) {
        if (value !== 0) {
            list.push({
                key,
                label: game.i18n.localize(`WH40K.ShipStat.${key.capitalize()}`),
                value,
            });
        }
    }
    return list;
}
