import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Oath items — the solemn vows a Battle-Brother swears before or
 * during a mission (Deathwatch Oaths, First Founding Chapter Oaths, and the like).
 * An oath is a declared benefit: it is sworn (not rolled), optionally gated by a
 * requirement, and grants an effect for its duration.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class OathData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare requirement: string;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that; the as-unknown cast satisfies DataField.Any without runtime effect
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // When and how the oath is sworn, plus any conditions on it.
            requirement: new fields.HTMLField({ required: false, blank: true }),

            // The benefit the oath grants while upheld.
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Freeform notes.
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** Oaths are sworn, not rolled. */
    get isRollable(): boolean {
        return false;
    }
}
