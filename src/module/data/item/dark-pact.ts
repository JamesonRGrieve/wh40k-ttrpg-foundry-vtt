import type { DarkPactEntry, DarkPactTerms } from '../../rules/dark-pact.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for a Dark Pact (DH2 Enemies Beyond pp. 72–76).
 *
 * A pact is content: the Boons a Daemon may grant and the Banes that come with
 * them, plus the terms of striking it (`negotiation`, `corruptionFormula`). The
 * GM picks which Boons and Banes a particular bargain carries; those choices
 * live on the actor's `system.pacts` entry, not here.
 *
 * Each Boon or Bane keeps its rules text in `description`. Mechanics the system
 * can apply are data: `modifiers` (a ModifiersTemplate-shaped block the actor
 * receives as an ActiveEffect while the entry is taken) and `grants`
 * (compendium items added with it). An entry with neither is the GM's to
 * adjudicate. See `rules/dark-pact.ts`.
 *
 * Homologated: every line can hold and track a pact; only DH2 prints any.
 *
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class DarkPactData extends ItemDataModel.mixin(DescriptionTemplate) {
    declare identifier: string;
    declare corruptionFormula: string;
    /** The Daemon's starting Disposition (`dispositionBase` + Corruption when `addsCorruption`) and the bargaining tests' modifier. */
    declare negotiation: DarkPactTerms;
    declare boons: DarkPactEntry[];
    declare banes: DarkPactEntry[];

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const entry = (): foundry.data.fields.DataField.Any =>
            new fields.ArrayField(
                new fields.SchemaField({
                    identifier: new fields.StringField({ required: true, blank: false }),
                    name: new fields.StringField({ required: true, blank: false }),
                    description: new fields.HTMLField({ required: false, blank: true, initial: '' }),
                    modifiers: new fields.ObjectField({ required: false, initial: {} }),
                    grants: new fields.ArrayField(
                        new fields.SchemaField({
                            uuid: new fields.StringField({ required: true, blank: false }),
                            specialization: new fields.StringField({ required: false, blank: true, initial: '' }),
                            level: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
                        }),
                        { required: false, initial: [] },
                    ),
                }),
                { required: true, initial: [] },
            );
        return {
            ...super.defineSchema(),
            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),
            corruptionFormula: new fields.StringField({ required: true, blank: true, initial: '' }),
            negotiation: new fields.SchemaField({
                dispositionBase: new fields.NumberField({ required: true, initial: 0, integer: true }),
                addsCorruption: new fields.BooleanField({ required: true, initial: false }),
                testModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),
            boons: entry(),
            banes: entry(),
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
