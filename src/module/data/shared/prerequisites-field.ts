import { PREREQUISITE_ALIGNMENTS } from '../../rules/prerequisites.ts';

/**
 * The `prerequisites` schema field shared by talents and psychic powers (#673, #675):
 * the printed text plus the structured gates, in the shape `rules/prerequisites.ts`
 * reads (`toStructuredPrerequisites`) and checks (`unmetPrerequisites`).
 */
export function prerequisitesField(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
        text: new fields.StringField({ required: true, blank: true, initial: '' }),
        characteristics: new fields.ObjectField({ required: true, initial: {} }),
        skills: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
        talents: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
        talentsAny: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
        alignment: new fields.StringField({ required: true, blank: true, initial: '', choices: [...PREREQUISITE_ALIGNMENTS] }),
        thresholds: new fields.ObjectField({ required: true, initial: {} }),
    });
}
