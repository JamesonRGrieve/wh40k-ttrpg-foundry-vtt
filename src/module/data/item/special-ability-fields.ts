/**
 * @file Schema fragment for the Deathwatch Distinction / Renown fields of a
 * `specialAbility` item (#171).
 *
 * Kept out of the shared {@link ../shared/simple-effect-item.ts simpleEffectItemSchema}
 * so `malignancy` items never gain these fields. Every field is optional with
 * a default, so special abilities authored before the fields existed (DW
 * speciality abilities, origin-path grants) load unchanged as `speciality`.
 *
 * The field shapes and `choices` come from `rules/dw-distinction.ts` and
 * `rules/dw-renown.ts`, which are the single source of truth for them.
 */
import { SPECIAL_ABILITY_CATEGORIES } from '../../rules/dw-distinction.ts';
import { RENOWN_RANK_ORDER } from '../../rules/dw-renown.ts';

/**
 * Build the Distinction / Renown schema fragment, spread into
 * `SpecialAbilityData.defineSchema()`.
 * @returns A schema fragment keyed by `category`, `renownRequired`, `renownReward`, `cost`, `marks` and `grant`.
 */
export function specialAbilityDistinctionSchema(): Record<string, foundry.data.fields.DataField.Any> {
    const fields = foundry.data.fields;
    return {
        category: new fields.StringField({ required: true, blank: false, initial: 'speciality', choices: [...SPECIAL_ABILITY_CATEGORIES] }),
        // Minimum Renown rank to gain the ability; null when the book prints none.
        renownRequired: new fields.StringField({ required: false, nullable: true, blank: false, initial: null, choices: [...RENOWN_RANK_ORDER] }),
        // Renown awarded when the ability is conferred.
        renownReward: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
        // Experience-point cost; Marks and Distinctions are bought with XP.
        cost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
        // Compendium UUIDs of the Marks a Distinction combines.
        marks: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] }),
        // A Mark's non-numeric grant; characteristic changes ride `modifiers.characteristics`.
        grant: new fields.SchemaField({
            trait: new fields.StringField({ required: true, blank: true, initial: '' }),
            activeEffect: new fields.StringField({ required: true, blank: true, initial: '' }),
        }),
    };
}
