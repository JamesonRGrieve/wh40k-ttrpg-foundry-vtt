import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Journal Entry items.
 * These are in-character notes and logs.
 */
export default class JournalEntryItemData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @foundry-v14-overrides.d.ts */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            time: new fields.StringField({ initial: '' }),
            place: new fields.StringField({ initial: '' }),
        };
    }

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props: string[] = [];
        const data = this as Record<string, unknown>;

        if (data.time) {
            props.push(data.time as string);
        }
        if (data.place) {
            props.push(data.place as string);
        }
        return props;
    }

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Array<Record<string, unknown>> {
        const labels: Array<Record<string, unknown>> = [];
        const data = this as Record<string, unknown>;

        if (data.time) {
            labels.push({ label: data.time as string, icon: 'fa-solid fa-clock' });
        }
        if (data.place) {
            labels.push({ label: data.place as string, icon: 'fa-solid fa-location-dot' });
        }
        return labels;
    }
}
