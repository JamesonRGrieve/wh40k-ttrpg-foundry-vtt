import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Attack Special (Weapon Quality) items.
 * These are special properties that can be attached to weapons/attacks.
 */
export default class AttackSpecialData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare enabled: boolean;
    declare hasLevel: boolean;
    declare level: number;

    /** @override */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            enabled: new fields.BooleanField({ initial: true }),
            hasLevel: new fields.BooleanField({ initial: false }),
            level: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        if (this.hasLevel && this.level > 0) {
            props.push(`Level ${this.level}`);
        }
        if (!this.enabled) {
            props.push('Disabled');
        }
        return props;
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        const labels = [];
        if (this.hasLevel && this.level > 0) {
            labels.push({ label: this.level.toString(), icon: 'fa-solid fa-layer-group' });
        }
        return labels;
    }

    /**
     * Get the display name including level if applicable.
     * @returns {string}
     */
    get displayName(): string {
        const parent = this.parent as { name?: string } | undefined;
        const name = parent?.name ?? '';
        if (this.hasLevel && this.level > 0) {
            return `${name} (${this.level})`;
        }
        return name;
    }
}
