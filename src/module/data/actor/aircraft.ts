import { ConventionalCraftData, locomotionField } from './vehicle.ts';

/**
 * Data model for atmospheric / sub-orbital flyers and skimmers.
 *
 * Adds the air-specific block on top of `ConventionalCraftData`:
 *   • `altitude` — the current flight tier (without.md p. 54-55). Only
 *     meaningful for craft with the Flyer trait. Moved OFF the base here so
 *     land/water craft do not carry a flight-tier field they never use.
 *   • `ceiling` — the maximum altitude tier the craft can reach.
 */
export default class AircraftData extends ConventionalCraftData {
    declare altitude: 'ground' | 'low' | 'high' | 'orbital';
    declare ceiling: 'ground' | 'low' | 'high' | 'orbital';

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();
        schema['locomotion'] = locomotionField('flyer');

        // === Flyer altitude (without.md p. 54-55) ===
        schema['altitude'] = new fields.StringField({
            required: true,
            initial: 'ground',
            choices: ['ground', 'low', 'high', 'orbital'],
            label: 'WH40K.Vehicle.Altitude',
        });

        // === Ceiling — maximum reachable altitude tier ===
        schema['ceiling'] = new fields.StringField({
            required: true,
            initial: 'high',
            choices: ['ground', 'low', 'high', 'orbital'],
            label: 'WH40K.Vehicle.Ceiling',
        });

        return schema;
    }
}
