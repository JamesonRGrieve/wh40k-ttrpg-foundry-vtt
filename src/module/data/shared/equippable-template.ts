import SystemDataModel from '../abstract/system-data-model.ts';

/**
 * Template for items that can be equipped.
 * @mixin
 */
export default class EquippableTemplate extends (SystemDataModel as any) {
    // Typed property declarations matching defineSchema()
    declare equipped: boolean;
    declare inBackpack: boolean;
    declare inShipStorage: boolean;
    declare container: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            equipped: new fields.BooleanField({ required: true, initial: false }),
            inBackpack: new fields.BooleanField({ required: true, initial: false }),
            inShipStorage: new fields.BooleanField({ required: true, initial: false }),
            container: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate equippable item data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        // Ensure boolean fields are proper booleans
        if (source.equipped !== undefined && typeof source.equipped !== 'boolean') {
            source.equipped = Boolean(source.equipped);
        }
        if (source.inBackpack !== undefined && typeof source.inBackpack !== 'boolean') {
            source.inBackpack = Boolean(source.inBackpack);
        }
        if (source.inShipStorage !== undefined && typeof source.inShipStorage !== 'boolean') {
            source.inShipStorage = Boolean(source.inShipStorage);
        }
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean equippable template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
        super._cleanData?.(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Is this item currently carried (not in storage)?
     * @type {boolean}
     */
    get isCarried(): boolean {
        return !this.container && !this.inBackpack && !this.inShipStorage;
    }

    /* -------------------------------------------- */

    /**
     * Is this item in ship storage?
     * @type {boolean}
     */
    get isInShipStorage(): boolean {
        return this.inShipStorage === true;
    }

    /* -------------------------------------------- */

    /**
     * Toggle the equipped state.
     * @returns {Promise<Item>}
     */
    toggleEquipped(): any {
        return (this as any).parent?.update({ 'system.equipped': !this.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Move to backpack.
     * @returns {Promise<Item>}
     */
    stowInBackpack(): any {
        return (this as any).parent?.update({
            'system.equipped': false,
            'system.inBackpack': true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from backpack.
     * @returns {Promise<Item>}
     */
    removeFromBackpack(): any {
        return (this as any).parent?.update({ 'system.inBackpack': false });
    }

    /* -------------------------------------------- */

    /**
     * Move to ship storage.
     * @returns {Promise<Item>}
     */
    stowInShipStorage(): any {
        return (this as any).parent?.update({
            'system.equipped': false,
            'system.inBackpack': false,
            'system.inShipStorage': true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from ship storage.
     * @returns {Promise<Item>}
     */
    removeFromShipStorage(): any {
        return (this as any).parent?.update({ 'system.inShipStorage': false });
    }
}
