import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";

/**
 * Data model for Peer and Enemy items.
 * These represent social connections with organizations/groups.
 */
export default class PeerEnemyData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            group: new fields.StringField({ initial: "" }),
            modifier: new fields.NumberField({ integer: true, initial: 0 })
        };
    }

    /** @override */
    get chatProperties() {
        const props = [];
        if (this.group) {
            props.push(this.group);
        }
        if (this.modifier !== 0) {
            const sign = this.modifier > 0 ? "+" : "";
            props.push(`${sign}${this.modifier}`);
        }
        return props;
    }

    /** @override */
    get headerLabels() {
        const labels = [];
        if (this.modifier !== 0) {
            const sign = this.modifier > 0 ? "+" : "";
            labels.push({ label: `${sign}${this.modifier}`, icon: "fa-solid fa-users" });
        }
        return labels;
    }

    /**
     * Check if this is a positive relationship (Peer).
     * @returns {boolean}
     */
    get isPeer() {
        return this.modifier >= 0;
    }

    /**
     * Check if this is a negative relationship (Enemy).
     * @returns {boolean}
     */
    get isEnemy() {
        return this.modifier < 0;
    }
}
