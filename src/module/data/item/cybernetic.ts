import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';
import IdentifierField from '../fields/identifier-field.ts';
import { bodyLocationsSchema } from '../shared/body-locations.ts';

/**
 * Data model for Cybernetic items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes ModifiersTemplate
 */
// @ts-expect-error - TS2417 static side inheritance
export default class CyberneticData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate, ModifiersTemplate) {
    [key: string]: any;
    /** @inheritdoc */
    static defineSchema() {
        const fields = (foundry.data as any).fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Cybernetic type
            type: new fields.StringField({
                required: true,
                initial: 'replacement',
                choices: ['replacement', 'implant', 'augmetic', 'bionic', 'mechadendrite', 'integrated-weapon'],
            }),

            // Body location(s) affected
            locations: new fields.SetField(
                new fields.StringField({
                    required: true,
                    choices: ['head', 'eyes', 'ears', 'mouth', 'brain', 'leftArm', 'rightArm', 'body', 'organs', 'leftLeg', 'rightLeg', 'spine', 'internal'],
                }),
                { required: true, initial: new Set() },
            ),

            // Provides armour points?
            hasArmourPoints: new fields.BooleanField({ required: true, initial: false }),
            armourPoints: bodyLocationsSchema(),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Drawbacks
            drawbacks: new fields.HTMLField({ required: false, blank: true }),

            // Installation requirements
            installation: new fields.SchemaField({
                surgery: new fields.StringField({ required: false, blank: true }),
                difficulty: new fields.StringField({ required: false, blank: true }),
                recoveryTime: new fields.StringField({ required: false, blank: true }),
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the cybernetic type label.
     * @type {string}
     */
    get typeLabel() {
        return game.i18n.localize(
            `WH40K.CyberneticType.${this.type
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Get the locations label.
     * @type {string}
     */
    get locationsLabel() {
        if (!this.locations.size) return '-';
        return Array.from(this.locations)
            // @ts-expect-error - dynamic property access
            .map((l) => game.i18n.localize(`WH40K.BodyLocation.${l.capitalize()}`))
            .join(', ');
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties() {
        // @ts-expect-error - TS2339
        const props = [...PhysicalItemTemplate.prototype.chatProperties.call(this), this.typeLabel, `Location: ${this.locationsLabel}`];

        if (this.hasArmourPoints) {
            const apValues = Object.entries(this.armourPoints)
                // @ts-expect-error - operator type
                .filter(([_, v]) => v > 0)
                .map(([k, v]) => `${k}: ${v}`);
            if (apValues.length) {
                props.push(`AP: ${apValues.join(', ')}`);
            }
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels() {
        return {
            type: this.typeLabel,
            location: this.locationsLabel,
        };
    }
}
