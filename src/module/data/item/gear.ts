import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';

/**
 * Data model for Gear items (general equipment).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class GearData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare consumable: boolean;
    declare uses: { value: number; max: number };
    declare effect: string;
    declare duration: string;
    declare notes: string;

    // Properties inherited from mixins, now explicitly declared for type safety.
    declare weight: number | null | undefined;
    declare quantity: number | null | undefined;
    declare craftsmanship: 'common' | 'poor' | 'good' | 'best';

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Identifier is a custom field type, assumed to be compatible with DataField.Any
            identifier: new IdentifierField({ required: true, blank: true }),

            // Gear category
            category: new fields.StringField({
                required: true,
                initial: 'general',
                choices: [
                    'general',
                    'tools',
                    'drugs',
                    'consumable',
                    'clothing',
                    'survival',
                    'communications',
                    'detection',
                    'medical',
                    'tech',
                    'religious',
                    'luxury',
                    'contraband',
                ],
            }),

            // Is this consumable?
            consumable: new fields.BooleanField({ required: true, initial: false }),

            // Uses/charges (for consumables)
            uses: new fields.SchemaField({
                value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
                max: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
            }),

            // Effect when used
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Duration of effect (for drugs, etc.)
            duration: new fields.StringField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize gear data shape.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        this.category = (resolveLineVariant(this.category as unknown, lineKey) as string) ?? 'general';
        this.consumable = Boolean(resolveLineVariant(this.consumable as unknown, lineKey));
        this.uses = foundry.utils.mergeObject({ value: 0, max: 0 }, (resolveLineVariant(this.uses as unknown, lineKey) as Record<string, unknown>) ?? {}, {
            inplace: false,
        }) as typeof this.uses;
        this.effect = (resolveLineVariant(this.effect as unknown, lineKey) as string) ?? '';
        this.duration = (resolveLineVariant(this.duration as unknown, lineKey) as string) ?? '';
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean gear data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions): void {
        super._cleanData?.(source, options);
        // Ensure uses values are integers
        if (source?.uses) {
            const uses = source.uses as Record<string, unknown>;
            if (uses.value !== undefined) {
                uses.value = parseInt(String(uses.value)) || 0;
            }
            if (uses.max !== undefined) {
                uses.max = parseInt(String(uses.max)) || 0;
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the category label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get categoryLabel(): string {
        const config = CONFIG.WH40K?.gearCategories?.[this.category];
        if (config?.label) return game.i18n.localize(config.label);
        return game.i18n.localize(`WH40K.GearCategory.${this.category.capitalize()}`);
    }

    /**
     * Get the category icon.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get categoryIcon() {
        const config = CONFIG.WH40K?.gearCategories?.[this.category];
        return config?.icon || 'fa-box';
    }

    /**
     * Does this item have limited uses?
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get hasLimitedUses() {
        return this.uses.max > 0;
    }

    /**
     * Are uses exhausted?
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get usesExhausted(): boolean {
        return this.hasLimitedUses && this.uses.value <= 0;
    }

    /**
     * Get uses display string (e.g., "5/10")
     * @scripts/gen-i18n-types.mjs {string}
     */
    get usesDisplay(): string {
        if (!this.hasLimitedUses) return '';
        return `${this.uses.value}/${this.uses.max}`;
    }

    /**
     * Get formatted weight label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get weightLabel(): string {
        return `${this.weight ?? 0} kg`;
    }

    /**
     * Get total weight (weight × quantity).
     * @scripts/gen-i18n-types.mjs {number}
     */
    get totalWeight() {
        return (this.weight ?? 0) * (this.quantity ?? 1);
    }

    /**
     * Get craftsmanship-derived modifiers.
     * Applies WH40K RPG craftsmanship rules for gear:
     * - Poor: Weight +10%, functionality issues (flavor)
     * - Good: Weight -10%, improved function
     * - Best: Weight -20%, superior performance
     *
     * @scripts/gen-i18n-types.mjs {object}
     */
    get craftsmanshipModifiers() {
        const mods = {
            weight: 1.0, // Weight multiplier
        };

        switch (this.craftsmanship) {
            case 'poor':
                mods.weight = 1.1; // +10% weight
                break;
            case 'good':
                mods.weight = 0.9; // -10% weight
                break;
            case 'best':
                mods.weight = 0.8; // -20% weight
                break;
        }

        return mods;
    }

    /**
     * Get effective weight including craftsmanship modifier.
     * @scripts/gen-i18n-types.mjs {number}
     */
    get effectiveWeight(): number {
        const craftMods = this.craftsmanshipModifiers;
        return Math.round((this.weight ?? 0) * craftMods.weight * 10) / 10; // Round to 1 decimal
    }

    /**
     * Get effective total weight (effective weight × quantity).
     * @scripts/gen-i18n-types.mjs {number}
     */
    get effectiveTotalWeight() {
        return this.effectiveWeight * (this.quantity ?? 1);
    }

    /**
     * Check if gear has craftsmanship-derived effects.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get hasCraftsmanshipEffects() {
        const craft = this.craftsmanship ?? 'common';
        return craft !== 'common';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        // Accessing the getter directly from the prototype, as it's a getter, not a method.
        const props = [...(PhysicalItemTemplate.prototype.chatProperties as unknown as string[] ?? []), this.categoryLabel];

        if (this.hasLimitedUses) {
            props.push(game.i18n.format('WH40K.Gear.UsesRemaining', { uses: this.usesDisplay }));
        }

        if (this.duration) {
            props.push(game.i18n.format('WH40K.Gear.Duration', { duration: this.duration }));
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        const labels = [];

        // Category badge
        labels.push({
            label: this.categoryLabel,
            icon: `fa-solid ${this.categoryIcon}`,
            tooltip: game.i18n.localize('WH40K.Gear.Category'),
        });

        // Uses indicator (if limited)
        if (this.hasLimitedUses) {
            labels.push({
                label: this.usesDisplay,
                icon: 'fa-solid fa-battery-three-quarters',
                tooltip: game.i18n.localize('WH40K.Gear.Uses'),
                cssClass: this.usesExhausted ? 'exhausted' : '',
            });
        }

        return labels;
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Consume one use.
     * @returns {Promise<Item>}
     */
    async consume(): Promise<unknown> {
        if (!this.hasLimitedUses) {
            ui.notifications.warn(game.i18n.localize('WH40K.Gear.NoConsumableUses'));
            return this.parent;
        }

        if (this.usesExhausted) {
            ui.notifications.warn(game.i18n.localize('WH40K.Gear.UsesExhausted'));
            return this.parent;
        }

        const newValue = Math.max(0, this.uses.value - 1);
        await this.parent?.update({ 'system.uses.value': newValue });

        // Notification
        ui.notifications.info(
            game.i18n.format('WH40K.Gear.ConsumedUse', {
                name: this.parent.name,
                remaining: `${newValue}/${this.uses.max}`,
            }),
        );

        return this.parent;
    }

    /**
     * Reset uses to maximum.
     * @returns {Promise<Item>}
     */
    async resetUses(): Promise<unknown> {
        if (!this.hasLimitedUses) return this.parent;

        await this.parent?.update({ 'system.uses.value': this.uses.max });

        ui.notifications.info(
            game.i18n.format('WH40K.Gear.UsesReset', {
                name: this.parent.name,
                max: String(this.uses.max),
            }),
        );

        return this.parent;
    }
}
