import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import BaseGrantData from './base-grant.ts';

/**
 * Grant that provides items (talents, traits, equipment) to an actor.
 * Uses UUID references for reliable item lookup.
 *
 * @extends BaseGrantData
 */
export default class ItemGrantData extends (BaseGrantData as any) {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static TYPE = 'item';
    static ICON = 'icons/svg/item-bag.svg';

    /**
     * Valid item types for this grant.
     * @type {Set<string>}
     */
    static VALID_TYPES = new Set(['talent', 'trait', 'weapon', 'armour', 'gear', 'ammunition', 'cybernetic', 'forceField', 'specialAbility']);

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Items to grant - array of UUID references
            items: new fields.ArrayField(
                new fields.SchemaField({
                    uuid: new fields.StringField({ required: true }),
                    optional: new fields.BooleanField({ initial: false }),
                    // Override data for the granted item
                    overrides: new fields.ObjectField({ required: false, initial: {} }),
                }),
                { required: true, initial: [] },
            ),

            // Applied state - tracks what was actually granted
            // Maps source UUID to created item ID on actor
            applied: new fields.ObjectField({ required: true, initial: {} }),
        };
    }

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Whether any items have been applied.
     * @type {boolean}
     */
    get hasApplied() {
        return Object.keys(this.applied).length > 0;
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _applyGrant(actor: WH40KBaseActor, data: Record<string, unknown>, options: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
        const items = this.items ?? [];
        if (items.length === 0) {
            result.notifications.push('Item grant has no items to apply');
            return;
        }

        const itemsToCreate = [];
        const selectedUuids = data.selected ?? items.map((i) => i.uuid);

        for (const itemConfig of items) {
            const { uuid, optional, overrides, _legacyName, _legacySpecialization } = itemConfig;

            // Try to find the item - first by UUID, then by name
            let sourceItem = null;
            let resolvedUuid = uuid;

            if (uuid) {
                sourceItem = await this._fetchItem(uuid);
            }

            // Fallback: lookup by name if no UUID or UUID not found
            if (!sourceItem && _legacyName) {
                sourceItem = await this._findItemByName(_legacyName, _legacySpecialization);
                if (sourceItem) {
                    resolvedUuid = sourceItem.uuid;
                    game.wh40k?.log(`ItemGrantData: Resolved "${_legacyName}" to UUID ${resolvedUuid}`);
                }
            }

            // Still no item found
            if (!sourceItem) {
                if (_legacyName) {
                    result.notifications.push(`Could not find "${_legacyName}" in compendiums`);
                } else if (uuid) {
                    result.errors.push(`Could not find item: ${uuid}`);
                }
                continue;
            }

            // Skip if not selected (only check when we have a UUID in selection list)
            if (uuid && !selectedUuids.includes(uuid)) {
                if (!optional && !this.optional) {
                    result.errors.push(`Required item ${uuid} not selected`);
                }
                continue;
            }

            // Validate item type
            if (!(this.constructor as any).VALID_TYPES.has(sourceItem.type)) {
                result.errors.push(`Invalid item type "${sourceItem.type}" for ${sourceItem.name}`);
                continue;
            }

            // Check for duplicates
            if (this._isDuplicate(actor, sourceItem)) {
                result.notifications.push(`${sourceItem.name} already exists, skipping`);
                continue;
            }

            // Create item data, applying specialization if present
            const effectiveOverrides = { ...overrides };
            if (_legacySpecialization && sourceItem.type === 'talent') {
                effectiveOverrides['system.specialization'] = _legacySpecialization;
                effectiveOverrides['name'] = `${sourceItem.name} (${_legacySpecialization})`;
            }
            const itemData = await this._createItemData(sourceItem, resolvedUuid, effectiveOverrides);
            itemsToCreate.push({ uuid: resolvedUuid, data: itemData });
        }

        // Apply if not dry run
        if (!options.dryRun && itemsToCreate.length > 0) {
            const created = await actor.createEmbeddedDocuments(
                'Item',
                itemsToCreate.map((i) => i.data),
            );

            // Track what was applied
            created.forEach((item, index) => {
                const sourceUuid = itemsToCreate[index].uuid;
                result.applied[sourceUuid] = item.id;
                result.notifications.push(`Granted: ${item.name}`);
            });
        } else if (options.dryRun) {
            // Preview mode
            itemsToCreate.forEach(({ data: itemData }) => {
                result.notifications.push(`Would grant: ${itemData.name}`);
            });
        }
    }

    /** @inheritDoc */
    async reverse(actor, appliedState): Promise<unknown> {
        const restoreData = { items: [] };
        const idsToDelete = [];

        for (const [uuid, itemId] of Object.entries(appliedState)) {
            const item = actor.items.get(itemId);
            if (item) {
                // Store item data for restore
                restoreData.items.push({
                    uuid,
                    data: item.toObject(),
                });
                idsToDelete.push(itemId);
            }
        }

        // Delete items from actor
        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }

        return restoreData;
    }

    /** @inheritDoc */
    async restore(actor, restoreData): Promise<unknown> {
        const result = this._initResult();
        if (!restoreData?.items?.length) return result;

        const itemsToCreate = restoreData.items.map(({ uuid, data }) => ({ uuid, data }));
        const created = await actor.createEmbeddedDocuments(
            'Item',
            itemsToCreate.map((i) => i.data),
        );

        created.forEach((item, index) => {
            result.applied[itemsToCreate[index].uuid] = item.id;
            result.notifications.push(`Restored: ${item.name}`);
        });

        return result;
    }

    /** @inheritDoc */
    getAutomaticValue(): Record<string, unknown> | false {
        if (this.optional) return false;
        if (this.items.some((i) => i.optional)) return false;
        return { selected: this.items.map((i) => i.uuid) };
    }

    /** @inheritDoc */
    async getSummary(): Promise<void> {
        const summary = await super.getSummary();
        summary.icon = (this.constructor as any).ICON;

        for (const itemConfig of this.items) {
            const item = await this._fetchItem(itemConfig.uuid);
            if (item) {
                summary.details.push({
                    label: item.name,
                    value: item.type,
                    optional: itemConfig.optional,
                    img: item.img,
                });
            } else {
                summary.details.push({
                    label: itemConfig.uuid,
                    value: 'Not found',
                    optional: itemConfig.optional,
                    error: true,
                });
            }
        }

        return summary;
    }

    /** @inheritDoc */
    validateGrant(): any {
        const errors = super.validateGrant();

        // items may be undefined if grant was created with invalid data
        const items = this.items ?? [];

        if (items.length === 0) {
            errors.push('Item grant has no items configured');
        }

        for (const itemConfig of items) {
            if (!itemConfig.uuid) {
                errors.push('Item grant entry missing UUID');
            }
        }

        return errors;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Check if an item already exists on the actor.
     * @param {WH40KActor} actor
     * @param {WH40KItem} sourceItem
     * @returns {boolean}
     * @private
     */
    _isDuplicate(actor, sourceItem): any {
        return actor.items.some(
            (i) =>
                i.type === sourceItem.type &&
                i.name === sourceItem.name &&
                // For talents/traits, also check specialization
                (i.type !== 'talent' || i.system?.specialization === sourceItem.system?.specialization),
        );
    }

    /**
     * Create item data for granting.
     * @param {WH40KItem} sourceItem
     * @param {string} uuid
     * @param {object} overrides
     * @returns {Promise<object>}
     * @private
     */
    _createItemData(sourceItem, uuid, overrides = {}): any {
        const itemData = sourceItem.toObject();

        // Apply overrides
        if (overrides && Object.keys(overrides).length > 0) {
            foundry.utils.mergeObject(itemData, overrides);
        }

        // Set grant flags
        itemData.flags = foundry.utils.mergeObject(itemData.flags ?? {}, this._createGrantFlags(uuid));

        // Generate new ID
        itemData._id = foundry.utils.randomID();

        return itemData;
    }

    /**
     * Find an item by name in compendiums.
     * Used as fallback when UUID is not available.
     * @param {string} name - Item name to search for
     * @param {string} [specialization] - Optional specialization for talents
     * @returns {Promise<Item|null>}
     * @private
     */
    async _findItemByName(name, specialization = ''): Promise<unknown> {
        if (!name) return null;

        const nameLower = name.toLowerCase();
        const compositeLower = specialization ? `${name} (${specialization})`.toLowerCase() : '';

        // Search all Item packs — talents/traits/gear are spread across
        // system-specific packs (dh2-core-stats-talents, rt-core-items-traits, etc.)
        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;

            const index = await pack.getIndex();

            const match = index.find((entry: any) => {
                const entryLower = entry.name.toLowerCase();
                if (entryLower === nameLower) return true;
                if (compositeLower && entryLower === compositeLower) return true;
                return false;
            });

            if (match) {
                return pack.getDocument(match._id);
            }
        }

        return null;
    }
}
