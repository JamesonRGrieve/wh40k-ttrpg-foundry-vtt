import { RIDER_AREA_MEASURES, RIDER_DURATION_KINDS, RIDER_TEST_CHARACTERISTICS } from '../../rules/grenade-rider.ts';

/**
 * The `rider` schema field (#135): a grenade's save-or-suffer payload, authored on its
 * compendium document (Direction #7) and read by `rules/grenade-rider.ts`.
 *
 * Nullable with a null default, so every weapon that carries no rider — almost all of
 * them — persists `rider: null`, and a rider is either authored whole or absent. The
 * effect is required and non-blank: a rider with nothing to say is not a rider.
 */
export function grenadeRiderField(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField(
        {
            test: new fields.SchemaField({
                characteristic: new fields.StringField({ required: true, blank: true, initial: '', choices: ['', ...RIDER_TEST_CHARACTERISTICS] }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),
            area: new fields.SchemaField({
                size: new fields.StringField({ required: true, blank: true, initial: '' }),
                measure: new fields.StringField({ required: true, blank: false, initial: 'radius', choices: [...RIDER_AREA_MEASURES] }),
            }),
            duration: new fields.SchemaField({
                kind: new fields.StringField({ required: true, blank: true, initial: '', choices: [...RIDER_DURATION_KINDS] }),
                base: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                formula: new fields.StringField({ required: true, blank: true, initial: '' }),
            }),
            effectRollShift: new fields.SchemaField({
                perDegree: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),
            effect: new fields.StringField({ required: true, blank: false }),
        },
        { required: false, nullable: true, initial: null },
    );
}
