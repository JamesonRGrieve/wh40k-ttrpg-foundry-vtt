import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Peer and Enemy items.
 * These represent social connections with organizations/groups.
 */
export default class PeerEnemyData extends ItemDataModel.mixin(DescriptionTemplate) {
    declare group: string;
    declare modifier: number;

    /** @foundry-v14-overrides.d.ts */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            group: new fields.StringField({ initial: '' }),
            modifier: new fields.NumberField({ integer: true, initial: 0 }),
        };
    }

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props = [];
        if (this.group) {
            props.push(this.group);
        }
        if (this.modifier !== 0) {
            const sign = this.modifier > 0 ? '+' : '';
            props.push(`${sign}${this.modifier}`);
        }
        return props;
    }

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        const labels = [];
        if (this.modifier !== 0) {
            const sign = this.modifier > 0 ? '+' : '';
            labels.push({ label: `${sign}${this.modifier}`, icon: 'fa-solid fa-users' });
        }
        return labels;
    }

    /**
     * Check if this is a positive relationship (Peer).
     * @returns {boolean}
     */
    get isPeer(): boolean {
        return this.modifier >= 0;
    }

    /**
     * Check if this is a negative relationship (Enemy).
     * @returns {boolean}
     */
    get isEnemy(): boolean {
        return this.modifier < 0;
    }
}
