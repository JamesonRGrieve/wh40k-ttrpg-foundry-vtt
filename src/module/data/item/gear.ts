import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

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

    // Properties from PhysicalItemTemplate
    declare weight: number;
    declare quantity: number;
    declare craftsmanship: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source is untyped legacy data
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        // eslint-disable-next-line no-restricted-syntax -- boundary: parent _source is Foundry's pre-processed raw payload, untyped at this layer
        const parent = this.parent as { _source?: { system?: Record<string, unknown> }; actor?: unknown } | null;
        const lineKey = inferActiveGameLine(parent?._source?.system ?? {}, parent);
        this.category = resolveLineVariant(this.category, lineKey);
        this.consumable = Boolean(resolveLineVariant(this.consumable, lineKey));
        this.uses = foundry.utils.mergeObject({ value: 0, max: 0 }, resolveLineVariant(this.uses, lineKey), {
            inplace: false,
        });
        this.effect = resolveLineVariant(this.effect, lineKey);
        this.duration = resolveLineVariant(this.duration, lineKey);
        this.notes = resolveLineVariant(this.notes, lineKey);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _cleanData receives untyped legacy source
    static override _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        // Ensure uses values are integers
        if (source?.['uses'] !== undefined && source['uses'] !== null && typeof source['uses'] === 'object') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _cleanData receives untyped legacy source
            const uses = source['uses'] as Record<string, unknown>;
            const usesValue = uses['value'];
            if (usesValue !== undefined) {
                uses['value'] = parseInt(typeof usesValue === 'string' || typeof usesValue === 'number' ? String(usesValue) : '') || 0;
            }
            const usesMax = uses['max'];
            if (usesMax !== undefined) {
                uses['max'] = parseInt(typeof usesMax === 'string' || typeof usesMax === 'number' ? String(usesMax) : '') || 0;
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the category label.
     * @type {string}
     */
    get categoryLabel(): string {
        const config = CONFIG.WH40K.gearCategories[this.category] as { label?: string; icon?: string } | undefined;
        if (config?.label !== undefined && config.label.length > 0) return game.i18n.localize(config.label);
        return game.i18n.localize(`WH40K.GearCategory.${this.category.capitalize()}`);
    }

    /**
     * Get the category icon.
     * @type {string}
     */
    get categoryIcon(): string {
        const config = CONFIG.WH40K.gearCategories[this.category] as { icon?: string } | undefined;
        return config?.icon ?? 'fa-box';
    }

    /**
     * Does this item have limited uses?
     * @type {boolean}
     */
    get hasLimitedUses(): boolean {
        return this.uses.max > 0;
    }

    /**
     * Are uses exhausted?
     * @type {boolean}
     */
    get usesExhausted(): boolean {
        return this.hasLimitedUses && this.uses.value <= 0;
    }

    /**
     * Get uses display string (e.g., "5/10")
     * @type {string}
     */
    get usesDisplay(): string {
        if (!this.hasLimitedUses) return '';
        return `${this.uses.value}/${this.uses.max}`;
    }

    /**
     * Get formatted weight label.
     * @type {string}
     */
    get weightLabel(): string {
        return `${this.weight} kg`;
    }

    /**
     * Get total weight (weight × quantity).
     * @type {number}
     */
    get totalWeight(): number {
        return this.weight * this.quantity;
    }

    /**
     * Get craftsmanship-derived modifiers.
     * Applies WH40K RPG craftsmanship rules for gear:
     * - Poor: Weight +10%, functionality issues (flavor)
     * - Good: Weight -10%, improved function
     * - Best: Weight -20%, superior performance
     *
     * @type {object}
     */
    get craftsmanshipModifiers(): { weight: number } {
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
     * @type {number}
     */
    get effectiveWeight(): number {
        const craftMods = this.craftsmanshipModifiers;
        return Math.round(this.weight * craftMods.weight * 10) / 10; // Round to 1 decimal
    }

    /**
     * Get effective total weight (effective weight × quantity).
     * @type {number}
     */
    get effectiveTotalWeight(): number {
        return this.effectiveWeight * this.quantity;
    }

    /**
     * Check if gear has craftsmanship-derived effects.
     * @type {boolean}
     */
    get hasCraftsmanshipEffects(): boolean {
        return this.craftsmanship !== 'common';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const inherited = (Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? [];
        const props = [...inherited, this.categoryLabel];

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

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns Foundry Item (untyped at this layer)
    async consume(): Promise<unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.parent (Foundry Item) needs narrowing for update + name access
        const parent = this.parent as { name: string; update: (data: Record<string, unknown>) => Promise<unknown> };
        if (!this.hasLimitedUses) {
            ui.notifications.warn(game.i18n.localize('WH40K.Gear.NoConsumableUses'));
            return parent;
        }

        if (this.usesExhausted) {
            ui.notifications.warn(game.i18n.localize('WH40K.Gear.UsesExhausted'));
            return parent;
        }

        const newValue = Math.max(0, this.uses.value - 1);
        await parent.update({ 'system.uses.value': newValue });

        // Notification
        ui.notifications.info(
            game.i18n.format('WH40K.Gear.ConsumedUse', {
                name: parent.name,
                remaining: `${newValue}/${this.uses.max}`,
            }),
        );

        return parent;
    }

    /**
     * Reset uses to maximum.
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: returns Foundry Item (untyped at this layer)
    async resetUses(): Promise<unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.parent (Foundry Item) needs narrowing for update + name access
        const parent = this.parent as { name: string; update: (data: Record<string, unknown>) => Promise<unknown> };
        if (!this.hasLimitedUses) return parent;

        await parent.update({ 'system.uses.value': this.uses.max });

        ui.notifications.info(
            game.i18n.format('WH40K.Gear.UsesReset', {
                name: parent.name,
                max: String(this.uses.max),
            }),
        );

        return parent;
    }
}
