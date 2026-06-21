/**
 * @file Shared schema fragment for "simple effect" item DataModels.
 *
 * Several item types are structurally identical: an `identifier`, a single
 * HTML effect/benefit field, and a free-text `notes` string, all layered on
 * top of `DescriptionTemplate` + `ModifiersTemplate`. The only thing that
 * differs is the *name* of the HTML field (`effect` vs `benefit`). This
 * factory parameterizes that field name so MalignancyData and
 * SpecialAbilityData (and any future sibling) share one schema source.
 *
 * @see {@link ../item/malignancy.ts}
 * @see {@link ../item/special-ability.ts}
 */
import IdentifierField from '../fields/identifier-field.ts';

/**
 * Build the per-model schema fragment for a simple effect item.
 *
 * The returned object is spread alongside `super.defineSchema()` in the
 * consuming model, so it carries only the fields unique to that family:
 * the identifier, the named HTML field, and notes.
 *
 * @param htmlFieldName - The name of the HTML field (e.g. `'effect'` or `'benefit'`).
 * @returns A schema fragment keyed by `identifier`, `<htmlFieldName>`, and `notes`.
 */
export function simpleEffectItemSchema(htmlFieldName: string): Record<string, foundry.data.fields.DataField.Any> {
    const fields = foundry.data.fields;
    return {
        // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends `any`; the as-unknown chain satisfies DataField.Any brand without runtime effect
        identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

        // Effect / benefit description (HTML)
        [htmlFieldName]: new fields.HTMLField({ required: true, blank: true }),

        // Notes
        notes: new fields.StringField({ required: false, blank: true }),
    };
}
