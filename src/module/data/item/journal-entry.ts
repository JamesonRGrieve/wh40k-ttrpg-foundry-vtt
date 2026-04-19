import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Journal Entry items.
 * These are in-character notes and logs.
 */
export default class JournalEntryItemData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            time: new fields.StringField({ initial: '' }),
            place: new fields.StringField({ initial: '' }),
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

    /** @override */
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
