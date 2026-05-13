import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/* eslint-disable no-restricted-syntax -- boundary: Foundry parent document API */
interface ForceFieldParent {
    name?: string;
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}
/* eslint-enable no-restricted-syntax */

/**
 * Data model for Force Field items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class ForceFieldData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare protectionRating: number;
    declare activated: boolean;
    declare overloaded: boolean;
    declare overloadMin: number;
    declare overloadMax: number;
    declare overloadDuration: string;
    declare effect: string;
    declare notes: string;

    // Properties from PhysicalItemTemplate
    declare craftsmanship: string;

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate force field data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source data
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        // Migrate old overloadThreshold field to overloadMin/overloadMax
        if (source['overloadThreshold'] !== undefined && source['overloadMin'] === undefined) {
            source['overloadMin'] = 1;
            source['overloadMax'] = source['overloadThreshold'];
        }
    }

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // Protection rating (1-100 roll threshold)
            protectionRating: new fields.NumberField({
                required: true,
                initial: 50,
                min: 0,
                max: 100,
                integer: true,
            }),

            // Current state
            activated: new fields.BooleanField({ required: true, initial: false }),
            overloaded: new fields.BooleanField({ required: true, initial: false }),

            // Overload threshold range (rolls within this range cause overload)
            // e.g., 01-10 means rolls 1-10 cause overload
            overloadMin: new fields.NumberField({
                required: true,
                initial: 1,
                min: 0,
                max: 100,
                integer: true,
            }),

            overloadMax: new fields.NumberField({
                required: true,
                initial: 10,
                min: 0,
                max: 100,
                integer: true,
            }),

            // Overload duration
            overloadDuration: new fields.StringField({
                required: true,
                initial: '1d5 rounds',
            }),

            // Effect description
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the status label.
     * @type {string}
     */
    get statusLabel(): string {
        if (this.overloaded) return game.i18n.localize('WH40K.ForceField.Overloaded');
        if (this.activated) return game.i18n.localize('WH40K.ForceField.Active');
        return game.i18n.localize('WH40K.ForceField.Inactive');
    }

    /**
     * Is the field currently providing protection?
     * @type {boolean}
     */
    get isProtecting(): boolean {
        return this.activated && !this.overloaded;
    }

    /**
     * Get craftsmanship-derived modifiers for force fields.
     * Applies WH40K RPG force field craftsmanship rules:
     *
     * FORCE FIELDS:
     * - Poor: Overload on 01-20
     * - Common: Overload on 01-10
     * - Good: Overload on 01-05
     * - Best: Overload on 01 only (1% chance)
     *
     * @type {object}
     */
    get craftsmanshipModifiers(): { overloadMin: number; overloadMax: number } {
        const mods = {
            overloadMin: 1,
            overloadMax: 10,
        };

        switch (this.craftsmanship) {
            case 'poor':
                mods.overloadMax = 20; // 01-20 overload (20% chance)
                break;
            case 'common':
                mods.overloadMax = 10; // 01-10 overload (10% chance)
                break;
            case 'good':
                mods.overloadMax = 5; // 01-05 overload (5% chance)
                break;
            case 'best':
                mods.overloadMax = 1; // 01 only overload (1% chance)
                break;
        }

        return mods;
    }

    /**
     * Get effective overload range (including craftsmanship).
     * @type {object}
     */
    get effectiveOverloadRange(): { min: number; max: number } {
        const craftMods = this.craftsmanshipModifiers;

        // If item has explicit overload values, use those
        // Otherwise use craftsmanship-derived values
        if (this.overloadMin !== 1 || this.overloadMax !== 10) {
            return {
                min: this.overloadMin,
                max: this.overloadMax,
            };
        }

        return {
            min: craftMods.overloadMin,
            max: craftMods.overloadMax,
        };
    }

    /**
     * Check if a protection roll causes overload.
     * @param {number} roll - The d100 protection roll
     * @returns {boolean}
     */
    checksOverload(roll: number): boolean {
        const range = this.effectiveOverloadRange;
        return roll >= range.min && roll <= range.max;
    }

    /**
     * Get overload range label for display.
     * @type {string}
     */
    get overloadRangeLabel(): string {
        const range = this.effectiveOverloadRange;
        if (range.min === range.max) {
            return `${String(range.min).padStart(2, '0')}`;
        }
        return `${String(range.min).padStart(2, '0')}-${String(range.max).padStart(2, '0')}`;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- intentionally invoke the prototype getter via .call
        const inheritedGetter = Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get;
        const inheritedProps = (inheritedGetter?.call(this) ?? []) as string[];
        const props = [...inheritedProps, `Protection: ${this.protectionRating}%`, `Overload: ${this.overloadRangeLabel}`, this.statusLabel];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            protection: `${this.protectionRating}%`,
            overload: this.overloadRangeLabel,
            status: this.statusLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Toggle activation state.
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update return type
    toggleActivated(): Promise<unknown> | undefined {
        const parent = this.parent as ForceFieldParent | undefined;
        return parent?.update?.({ 'system.activated': !this.activated });
    }

    /**
     * Set overloaded state.
     * @param {boolean} overloaded
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update return type
    setOverloaded(overloaded: boolean): Promise<unknown> | undefined {
        const parent = this.parent as ForceFieldParent | undefined;
        return parent?.update?.({ 'system.overloaded': overloaded });
    }

    /**
     * Recover from overload.
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update return type
    recover(): Promise<unknown> | undefined {
        const parent = this.parent as ForceFieldParent | undefined;
        return parent?.update?.({ 'system.overloaded': false });
    }

    /**
     * Roll protection check against incoming damage.
     * @param {object} [options] - Roll options
     * @returns {Promise<object>} - Result object with { isProtected: boolean, overloaded: boolean, roll: Roll }
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollProtection result varies; consumers cast as needed
    async rollProtection(options: { speaker?: ReturnType<(typeof ChatMessage)['getSpeaker']> } = {}): Promise<unknown> {
        if (!this.isProtecting) {
            return { isProtected: false, overloaded: false, roll: null, inactive: true };
        }

        // Roll d100
        const roll = await new Roll('1d100').evaluate();

        // Check if protected (roll <= protection rating)
        const isProtected = roll.total <= this.protectionRating;

        // Check if overloaded (roll in overload range)
        const overloaded = this.checksOverload(roll.total);

        // Show roll to chat
        await roll.toMessage({
            flavor: game.i18n.format('WH40K.ForceField.ProtectionRoll', {
                name: (this.parent as { name?: string } | undefined)?.name ?? 'Force Field',
                isProtected: isProtected ? game.i18n.localize('WH40K.ForceField.Protected') : game.i18n.localize('WH40K.ForceField.NotProtected'),
                overloaded: overloaded ? ` (${game.i18n.localize('WH40K.ForceField.Overloaded')}!)` : '',
            }),
            speaker: options.speaker,
        });

        // Update overload state if necessary
        if (overloaded) {
            await this.setOverloaded(true);
        }

        return { isProtected, overloaded, roll };
    }
}
