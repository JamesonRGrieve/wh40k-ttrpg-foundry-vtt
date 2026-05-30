import { ConventionalCraftData, LOCOMOTION_CHOICES } from './vehicle.ts';

/**
 * Data model for waterborne conventional vehicles (boats, hovercraft on water,
 * submersibles).
 *
 * Adds the water-specific block on top of `ConventionalCraftData`:
 *   • `draught` — how deep the hull sits below the waterline. Schema-only —
 *     no content currently authors watercraft, so this is a placeholder field
 *     for future water-vehicle content.
 */
export default class WatercraftData extends ConventionalCraftData {
    declare draught: number;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();
        schema['locomotion'] = new fields.StringField({
            required: true,
            initial: 'hull',
            choices: [...LOCOMOTION_CHOICES],
            label: 'WH40K.Vehicle.Locomotion',
        });

        // === Draught — hull depth below the waterline ===
        schema['draught'] = new fields.NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            label: 'WH40K.Vehicle.Draught',
        });

        return schema;
    }
}
