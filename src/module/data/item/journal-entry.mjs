import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";

/**
 * Data model for Journal Entry items.
 * These are in-character notes and logs.
 */
export default class JournalEntryItemData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            time: new fields.StringField({ initial: "" }),
            place: new fields.StringField({ initial: "" })
        };
    }

    /** @override */
    get chatProperties() {
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
    get headerLabels() {
        const labels = [];
        if (this.time) {
            labels.push({ label: this.time, icon: "fa-solid fa-clock" });
        }
        if (this.place) {
            labels.push({ label: this.place, icon: "fa-solid fa-location-dot" });
        }
        return labels;
    }
}
