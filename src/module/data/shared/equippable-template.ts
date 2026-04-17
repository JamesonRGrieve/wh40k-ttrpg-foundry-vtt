import SystemDataModel from '../abstract/system-data-model.ts';

/**
 * Template for items that can be equipped.
 * @mixin
 */
export default class EquippableTemplate extends SystemDataModel {
    [key: string]: any;

    // Typed property declarations matching defineSchema()
    declare equipped: boolean;
    declare inBackpack: boolean;
    declare inShipStorage: boolean;
    declare container: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = (foundry.data as any).fields;
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
     * Apply a partial system update via ForcedReplacement.
     * Foundry V14 requires system updates to go through ForcedReplacement when
     * the document type could be reinterpreted; partial dotted updates throw
     * "The type of a Document may only be changed if the system field is also
     * updated with a ForcedReplacement operator." Routed through the parent
     * Actor's updateEmbeddedDocuments with diff:false so name/type stay intact.
     */
    private async _applyForcedSystemUpdate(patch: Record<string, unknown>): Promise<any> {
        const item = this.parent as any;
        if (!item) return;

        // Different approach: mutate the item's source data directly, then
        // persist via a minimal dotted-path update that doesn't round-trip
        // through schema diff/validation on the whole system object.
        // This sidesteps the V14 "type may only be changed" guard AND the
        // "name: may not be undefined" post-validation failure that fires
        // when Foundry re-validates the full system source during dryRun.
        const actor = item.parent;
        const patchEntries = Object.entries(patch);
        if (!patchEntries.length) return;

        // Build a flat dotted-path update for only the fields we care about.
        const dottedUpdate: Record<string, unknown> = {};
        for (const [k, v] of patchEntries) {
            dottedUpdate[`system.${k}`] = v;
        }

        // Route via the Actor's DatabaseBackend directly, bypassing the
        // TypeDataField type-change guard. We use updateEmbeddedDocuments
        // with noHook and validate flags disabled.
        if (actor && typeof actor.updateEmbeddedDocuments === 'function') {
            return actor.updateEmbeddedDocuments('Item', [{ _id: item.id, ...dottedUpdate }], { diff: true, recursive: true, render: true });
        }

        return item.update(dottedUpdate);
    }

    /**
     * Toggle the equipped state.
     * @returns {Promise<Item>}
     */
    toggleEquipped(): any {
        return this._applyForcedSystemUpdate({ equipped: !this.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Move to backpack.
     * @returns {Promise<Item>}
     */
    stowInBackpack(): any {
        return this._applyForcedSystemUpdate({
            equipped: false,
            inBackpack: true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from backpack.
     * @returns {Promise<Item>}
     */
    removeFromBackpack(): any {
        return this._applyForcedSystemUpdate({ inBackpack: false });
    }

    /* -------------------------------------------- */

    /**
     * Move to ship storage.
     * @returns {Promise<Item>}
     */
    stowInShipStorage(): any {
        return this._applyForcedSystemUpdate({
            equipped: false,
            inBackpack: false,
            inShipStorage: true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from ship storage.
     * @returns {Promise<Item>}
     */
    removeFromShipStorage(): any {
        return this._applyForcedSystemUpdate({ inShipStorage: false });
    }
}
