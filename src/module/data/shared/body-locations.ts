/**
 * @file Shared body-location schema helper
 * Produces a SchemaField covering the six hit locations used by armour and cybernetics.
 */

/**
 * Build a SchemaField for the six standard body locations.
 * @returns {SchemaField}
 */
export function bodyLocationsSchema() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
        head: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        leftArm: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        rightArm: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        body: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        leftLeg: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        rightLeg: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
    });
}
