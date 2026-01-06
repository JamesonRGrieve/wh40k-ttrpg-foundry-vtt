import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";

/**
 * Data model for Attack Special (Weapon Quality) items.
 * These are special properties that can be attached to weapons/attacks.
 */
export default class AttackSpecialData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            enabled: new fields.BooleanField({ initial: true }),
            hasLevel: new fields.BooleanField({ initial: false }),
            level: new fields.NumberField({ integer: true, initial: 0, min: 0 })
        };
    }

    /** @override */
    get chatProperties() {
        const props = [];
        if (this.hasLevel && this.level > 0) {
            props.push(`Level ${this.level}`);
        }
        if (!this.enabled) {
            props.push("Disabled");
        }
        return props;
    }

    /** @override */
    get headerLabels() {
        const labels = [];
        if (this.hasLevel && this.level > 0) {
            labels.push({ label: this.level.toString(), icon: "fa-solid fa-layer-group" });
        }
        return labels;
    }

    /**
     * Get the display name including level if applicable.
     * @returns {string}
     */
    get displayName() {
        if (this.hasLevel && this.level > 0) {
            return `${this.parent.name} (${this.level})`;
        }
        return this.parent.name;
    }
}
