import { ConventionalCraftData } from './vehicle.ts';

/**
 * Data model for land-going conventional vehicles (tanks, walkers, bikes,
 * ground transports). The default conventional craft — it adds no fields
 * beyond `ConventionalCraftData`; its identity is the fixed `locomotion: 'terra'`
 * discriminator.
 */
export default class TerracraftData extends ConventionalCraftData {
    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();
        schema['locomotion'] = new fields.StringField({
            required: true,
            initial: 'terra',
            choices: ['terra', 'air', 'water', 'void'],
            label: 'WH40K.Vehicle.Locomotion',
        });
        return schema;
    }
}
