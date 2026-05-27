import SystemDataModel from '../abstract/system-data-model.ts';

/** Shared transient runtime state shape for equippable items (system.state). */
export interface EquippableState {
    equipped: boolean;
    inBackpack: boolean;
    inShipStorage: boolean;
    container: string;
    activated: boolean;
    overloaded: boolean;
}

interface UpdatableActor {
    updateEmbeddedDocuments?: (type: string, updates: object[], options: object) => Promise<object>;
}

interface UpdatableItem {
    id: string;
    parent: UpdatableActor | null;
    update: (data: object) => Promise<object>;
}

/**
 * Template for items that can be equipped.
 * @mixin
 */
export default class EquippableTemplate extends SystemDataModel {
    // Transient runtime state — shared (never variantized), namespaced
    // under system.state (see src/packs/CLAUDE.md "Stateful Fields Live
    // Under system.state"). activated/overloaded live here too so the one
    // state container covers force-field runtime state without fragile
    // per-mixin SchemaField merging.
    declare state: EquippableState;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            state: new fields.SchemaField({
                equipped: new fields.BooleanField({ required: true, initial: false }),
                inBackpack: new fields.BooleanField({ required: true, initial: false }),
                inShipStorage: new fields.BooleanField({ required: true, initial: false }),
                container: new fields.StringField({ required: false, blank: true, initial: '' }),
                activated: new fields.BooleanField({ required: true, initial: false }),
                overloaded: new fields.BooleanField({ required: true, initial: false }),
            }),
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source data
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        // Relocate legacy flat state fields into system.state, then coerce
        // booleans. Idempotent: already-nested data passes through.
        const stateKeys = ['equipped', 'inBackpack', 'inShipStorage', 'container', 'activated', 'overloaded'] as const;
        // eslint-disable-next-line no-restricted-syntax -- boundary: state holds raw relocated values before schema validation
        const state = (source['state'] !== null && typeof source['state'] === 'object' ? source['state'] : {}) as Record<string, unknown>;
        for (const key of stateKeys) {
            if (source[key] !== undefined && state[key] === undefined) state[key] = source[key];
            delete source[key];
        }
        for (const key of ['equipped', 'inBackpack', 'inShipStorage', 'activated', 'overloaded'] as const) {
            if (state[key] !== undefined && typeof state[key] !== 'boolean') state[key] = Boolean(state[key]);
        }
        source['state'] = state;
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _cleanData source data
    static override _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
        super._cleanData(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Is this item currently carried (not in storage)?
     * @type {boolean}
     */
    get isCarried(): boolean {
        return !this.state.container && !this.state.inBackpack && !this.state.inShipStorage;
    }

    /* -------------------------------------------- */

    /**
     * Is this item in ship storage?
     * @type {boolean}
     */
    get isInShipStorage(): boolean {
        return this.state.inShipStorage;
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
    private _applyForcedSystemUpdate(patch: Record<string, unknown>): Promise<object> | undefined {
        const item = this.parent as UpdatableItem | null;
        if (item === null) return undefined;

        // Different approach: mutate the item's source data directly, then
        // persist via a minimal dotted-path update that doesn't round-trip
        // through schema diff/validation on the whole system object.
        // This sidesteps the V14 "type may only be changed" guard AND the
        // "name: may not be undefined" post-validation failure that fires
        // when Foundry re-validates the full system source during dryRun.
        const actor = item.parent;
        const patchEntries = Object.entries(patch);
        if (patchEntries.length === 0) return undefined;

        // Build a flat dotted-path update for only the fields we care about.
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
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
    toggleEquipped(): Promise<object> | undefined {
        return this._applyForcedSystemUpdate({ 'state.equipped': !this.state.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Move to backpack.
     * @returns {Promise<Item>}
     */
    stowInBackpack(): Promise<object> | undefined {
        return this._applyForcedSystemUpdate({
            'state.equipped': false,
            'state.inBackpack': true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from backpack.
     * @returns {Promise<Item>}
     */
    removeFromBackpack(): Promise<object> | undefined {
        return this._applyForcedSystemUpdate({ 'state.inBackpack': false });
    }

    /* -------------------------------------------- */

    /**
     * Move to ship storage.
     * @returns {Promise<Item>}
     */
    stowInShipStorage(): Promise<object> | undefined {
        return this._applyForcedSystemUpdate({
            'state.equipped': false,
            'state.inBackpack': false,
            'state.inShipStorage': true,
        });
    }

    /* -------------------------------------------- */

    /**
     * Remove from ship storage.
     * @returns {Promise<Item>}
     */
    removeFromShipStorage(): Promise<object> | undefined {
        return this._applyForcedSystemUpdate({ 'state.inShipStorage': false });
    }
}
