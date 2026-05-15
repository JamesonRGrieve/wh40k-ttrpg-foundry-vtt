import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Status of an Investigation Lead (core.md §"Conducting The Investigation").
 * - `active`: the lead is open and worth pursuing.
 * - `pursued`: acolytes are currently working it.
 * - `resolved`: the lead paid off and is closed.
 * - `deadEnd`: the lead was investigated and yielded nothing.
 */
export type LeadStatus = 'active' | 'pursued' | 'resolved' | 'deadEnd';

/**
 * Data model for Journal Entry items.
 *
 * Doubles as the Investigation Lead container per core.md §"Leads"
 * (p. 282) — when `isLead === true`, the additional lead-specific
 * fields (status, source, owner) are populated and the sheet renders
 * the lead view. Otherwise the entry is a plain in-character note.
 */
export default class JournalEntryItemData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare time: string;
    declare place: string;
    declare isLead: boolean;
    declare leadStatus: LeadStatus;
    /** The clue / source that produced this lead. */
    declare leadSource: string;
    /** GM-only flag — true if the lead is a deliberate dead-end (red herring). */
    declare leadGmRedHerring: boolean;

    /** @override */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            time: new fields.StringField({ initial: '' }),
            place: new fields.StringField({ initial: '' }),
            isLead: new fields.BooleanField({ required: true, initial: false }),
            leadStatus: new fields.StringField({
                required: true,
                initial: 'active',
                choices: ['active', 'pursued', 'resolved', 'deadEnd'],
            }),
            leadSource: new fields.StringField({ required: false, initial: '', blank: true }),
            leadGmRedHerring: new fields.BooleanField({ required: true, initial: false }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        if (this.time) {
            props.push(this.time);
        }
        if (this.place) {
            props.push(this.place);
        }
        return props;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        const labels = [];
        if (this.time) {
            labels.push({ label: this.time, icon: 'fa-solid fa-clock' });
        }
        if (this.place) {
            labels.push({ label: this.place, icon: 'fa-solid fa-location-dot' });
        }
        return labels;
    }
}
