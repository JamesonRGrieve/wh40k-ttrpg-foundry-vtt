import { MEDAL_HONOUR_TYPES, type MedalHonourType } from '../../rules/ow-regimental-award.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Medal items: Only War's Medals and Honours (OW core).
 *
 * The book presents each one as a Description (the medal itself, kept in
 * `description`), what it is Awarded for, and the Squad Bonus the Squad gains
 * for having the bearer in its ranks. `honourType` is the book's broad type:
 * an Imperial Honour, a Campaign Honour or a Regimental Award. The Squad Bonus
 * is rules text the GM applies; the book prints it as situational test
 * modifiers, so it carries no structured modifier here.
 *
 * Conferred medals are recorded on an OW character's `system.regimentalAwards`
 * by UUID, and the Battlefield panel lists them (#161, content#32).
 *
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class MedalData extends ItemDataModel.mixin(DescriptionTemplate) {
    declare identifier: string;
    declare honourType: MedalHonourType;
    declare awardedFor: string;
    declare squadBonus: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),
            honourType: new fields.StringField({ required: true, blank: false, initial: 'regimental', choices: [...MEDAL_HONOUR_TYPES] }),
            awardedFor: new fields.HTMLField({ required: true, blank: true, initial: '' }),
            squadBonus: new fields.HTMLField({ required: true, blank: true, initial: '' }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        return [];
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {};
    }
}
