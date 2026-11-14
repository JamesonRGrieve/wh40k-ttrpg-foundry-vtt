import ItemDataModel from '../abstract/item-data-model.ts';
import { identifierField } from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate, { type EquippableState } from '../shared/equippable-template.ts';
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
    // activated / overloaded are runtime state — inherited via EquippableTemplate's system.state.
    declare state: EquippableState;
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

            identifier: identifierField({ required: true, blank: true }),

            // Protection rating (1-100 roll threshold)
            protectionRating: new fields.NumberField({
                required: true,
                initial: 50,
                min: 0,
                max: 100,
                integer: true,
            }),

            // Current state (activated / overloaded) lives in system.state
            // via EquippableTemplate — not redeclared here.

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
        if (this.state.overloaded) return game.i18n.localize('WH40K.ForceField.Overloaded');
        if (this.state.activated) return game.i18n.localize('WH40K.ForceField.Active');
        return game.i18n.localize('WH40K.ForceField.Inactive');
    }

    /**
     * Is the field currently providing protection?
     * @type {boolean}
     */
    get isProtecting(): boolean {
        return this.state.activated && !this.state.overloaded;
    }

    /**
     * Get craftsmanship-derived modifiers for force fields.
     * Applies WH40K RPG force field craftsmanship rules:
     *
     * FORCE FIELDS (Field Overload Chance: DH2,
     * OW and BC, all alike):
     * - Poor: Overload on 01-15
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

        const OVERLOAD_MAX_BY_CRAFT: Record<string, number> = {
            poor: 15, // 01-15 overload (15% chance)
            common: 10, // 01-10 overload (10% chance)
            good: 5, // 01-05 overload (5% chance)
            best: 1, // 01 only overload (1% chance)
        };
        const overrideMax = OVERLOAD_MAX_BY_CRAFT[this.craftsmanship];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test.json lacks noUncheckedIndexedAccess; main tsconfig requires this guard
        if (overrideMax !== undefined) mods.overloadMax = overrideMax;

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
        return parent?.update?.({ 'system.state.activated': !this.state.activated });
    }

    /**
     * Set overloaded state.
     * @param {boolean} overloaded
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update return type
    setOverloaded(overloaded: boolean): Promise<unknown> | undefined {
        const parent = this.parent as ForceFieldParent | undefined;
        return parent?.update?.({ 'system.state.overloaded': overloaded });
    }

    /**
     * Recover from overload.
     * @returns {Promise<Item>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update return type
    recover(): Promise<unknown> | undefined {
        const parent = this.parent as ForceFieldParent | undefined;
        return parent?.update?.({ 'system.state.overloaded': false });
    }
}
