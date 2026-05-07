import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import { bodyLocationsSchema } from '../shared/body-locations.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';

/**
 * Data model for Cybernetic items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes ModifiersTemplate
 */
export default class CyberneticData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare type: string;
    declare locations: Set<string>;
    declare hasArmourPoints: boolean;
    declare armourPoints: { head: number; leftArm: number; rightArm: number; body: number; leftLeg: number; rightLeg: number };
    declare effect: string;
    declare drawbacks: string;
    declare installation: { surgery: string; difficulty: string; recoveryTime: string };
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

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
                { required: true, initial: [] },
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

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        this.type = (resolveLineVariant(this.type as unknown, lineKey) as string) ?? 'replacement';

        const resolvedLocations = resolveLineVariant(this.locations as unknown, lineKey);
        this.locations = new Set(Array.isArray(resolvedLocations) ? resolvedLocations : Array.from((resolvedLocations as Set<string>) ?? new Set()));

        this.hasArmourPoints = Boolean(resolveLineVariant(this.hasArmourPoints as unknown, lineKey));
        this.armourPoints = foundry.utils.mergeObject(
            {
                head: 0,
                leftArm: 0,
                rightArm: 0,
                body: 0,
                leftLeg: 0,
                rightLeg: 0,
            },
            (resolveLineVariant(this.armourPoints as unknown, lineKey) as Record<string, unknown>) ?? {},
            { inplace: false },
        ) as typeof this.armourPoints;

        this.effect = (resolveLineVariant(this.effect as unknown, lineKey) as string) ?? '';
        this.drawbacks = (resolveLineVariant(this.drawbacks as unknown, lineKey) as string) ?? '';
        this.installation = foundry.utils.mergeObject(
            { surgery: '', difficulty: '', recoveryTime: '' },
            (resolveLineVariant(this.installation as unknown, lineKey) as Record<string, unknown>) ?? {},
            { inplace: false },
        ) as typeof this.installation;
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the cybernetic type label.
     * @type {string}
     */
    get typeLabel(): string {
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
    get locationsLabel(): string {
        if (!this.locations.size) return '-';
        return Array.from(this.locations)
            .map((l) => game.i18n.localize(`WH40K.BodyLocation.${l.capitalize()}`))
            .join(', ');
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            ...((Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get?.call(this) as string[]) ?? []),
            this.typeLabel,
            `Location: ${this.locationsLabel}`,
        ];

        if (this.hasArmourPoints) {
            const apValues = Object.entries(this.armourPoints)
                .filter(([_, v]) => (v as number) > 0)
                .map(([k, v]) => `${k}: ${v as number}`);
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
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.typeLabel,
            location: this.locationsLabel,
        };
    }
}
