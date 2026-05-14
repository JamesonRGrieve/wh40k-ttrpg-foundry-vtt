import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantApplyOptions, type GrantRestoreData, type GrantSummary } from './base-grant.ts';

/**
 * Interface for a single item grant configuration.
 */
interface ItemGrantConfig {
    uuid: string;
    optional: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: overrides is an open-ended item field override map (arbitrary Foundry document fields)
    overrides?: Record<string, unknown>;
}

/**
 * Grant that provides items (talents, traits, equipment) to an actor.
 * Uses UUID references for reliable item lookup.
 *
 * @extends BaseGrantData
 */
export default class ItemGrantData extends BaseGrantData {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static override TYPE = 'item';
    static override ICON = 'icons/svg/item-bag.svg';

    /**
     * Valid item types for this grant.
     * @type {Set<string>}
     */
    static VALID_TYPES = new Set(['talent', 'trait', 'weapon', 'armour', 'gear', 'ammunition', 'cybernetic', 'forceField', 'specialAbility']);

    /** Property declarations */
    declare items: ItemGrantConfig[];
    declare applied: Record<string, string>; // Maps source UUID to created item ID on actor

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
    get hasApplied(): boolean {
        return Object.keys(this.applied).length > 0;
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: GrantApplyOptions, result: GrantApplicationResult): Promise<void> {
        const ctor = this.constructor as typeof ItemGrantData;
        const items = this.items;
        if (items.length === 0) {
            result.notifications.push('Item grant has no items to apply');
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: itemData is Foundry toObject() payload; shape is item-type-specific and unknown at grant level
        const itemsToCreate: Array<{ uuid: string; data: Record<string, unknown> }> = [];
        const selectedUuids = (data['selected'] as string[] | undefined) ?? items.map((i) => i.uuid);

        // Pre-fetch all source items in parallel to avoid await-in-loop
        const fetchedItems = await Promise.all(items.map(async (cfg) => (cfg.uuid !== '' ? this._fetchItem(cfg.uuid) : null)));

        for (const [configIndex, itemConfig] of items.entries()) {
            const { uuid, optional, overrides } = itemConfig;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: fetchedItems is array-indexed
            const sourceItem = fetchedItems[configIndex] ?? null;

            if (!sourceItem) {
                if (uuid !== '') result.errors.push(`Could not find item: ${uuid}`);
                continue;
            }

            // Skip if not selected
            if (!selectedUuids.includes(uuid)) {
                if (!optional && !this.optional) {
                    result.errors.push(`Required item ${uuid} not selected`);
                }
                continue;
            }

            // Validate item type
            if (!ctor.VALID_TYPES.has(sourceItem.type)) {
                result.errors.push(`Invalid item type "${sourceItem.type}" for ${sourceItem.name}`);
                continue;
            }

            const effectiveOverrides = { ...(overrides ?? {}) };
            const effectiveName = (effectiveOverrides['name'] as string | undefined) ?? sourceItem.name;
            const effectiveSpec =
                (effectiveOverrides['system.specialization'] as string | undefined) ??
                (sourceItem.system as { specialization?: string } | undefined)?.specialization;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- effectiveName derives from sourceItem.name which may be null per WH40KItem type
            if (this._isDuplicateByName(actor, sourceItem.type, effectiveName ?? '', effectiveSpec)) {
                result.notifications.push(`${effectiveName} already exists, skipping`);
                continue;
            }

            const itemData = this._createItemData(sourceItem, uuid, effectiveOverrides);
            itemsToCreate.push({ uuid, data: itemData });
        }

        // Apply if not dry run
        if (options.dryRun !== true && itemsToCreate.length > 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor.createEmbeddedDocuments is not on the base type; cast required for item creation
            const actorWithCreate = actor as unknown as { createEmbeddedDocuments: (name: string, data: Record<string, unknown>[]) => Promise<WH40KItem[]> };
            const created = await actorWithCreate.createEmbeddedDocuments(
                'Item',
                itemsToCreate.map((i) => i.data),
            );

            // Track what was applied
            for (const [index, item] of created.entries()) {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: itemsToCreate is array-indexed
                const sourceUuid = itemsToCreate[index]?.uuid ?? '';
                result.applied[sourceUuid] = item.id ?? '';
                result.notifications.push(`Granted: ${item.name}`);
            }
        } else if (options.dryRun === true) {
            // Preview mode
            itemsToCreate.forEach(({ data: itemData }) => {
                result.notifications.push(`Would grant: ${String(itemData['name'])}`);
            });
        }
    }

    /** @inheritDoc */
    /* eslint-disable no-restricted-syntax -- boundary: item toObject() payload is Record<string,unknown>; shape varies by item type and cannot be narrowed at grant level */
    override async reverse(
        actor: WH40KBaseActor,
        appliedState: Record<string, string>,
    ): Promise<{ items: Array<{ uuid: string; data: Record<string, unknown> }> }> {
        const restoreData: { items: Array<{ uuid: string; data: Record<string, unknown> }> } = { items: [] };
        /* eslint-enable no-restricted-syntax */
        const idsToDelete: string[] = [];

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
    /* eslint-disable no-restricted-syntax -- boundary: item toObject() payload is Record<string,unknown>; shape varies by item type */
    override async restore(
        actor: WH40KBaseActor,
        restoreData: { items: Array<{ uuid: string; data: Record<string, unknown> }> },
    ): Promise<GrantApplicationResult> {
        /* eslint-enable no-restricted-syntax */
        const result = this._initResult();
        const items = restoreData.items;
        if (items.length === 0) return result;

        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor.createEmbeddedDocuments is not on the base type; cast required for item creation
        const actorWithCreate = actor as unknown as { createEmbeddedDocuments: (name: string, data: Record<string, unknown>[]) => Promise<WH40KItem[]> };
        const created = await actorWithCreate.createEmbeddedDocuments(
            'Item',
            items.map((i) => i.data),
        );

        for (const [index, item] of created.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: items is array-indexed
            result.applied[items[index]?.uuid ?? ''] = item.id ?? '';
            result.notifications.push(`Restored: ${item.name}`);
        }

        return result;
    }

    /** @inheritDoc */
    override getAutomaticValue(): GrantRestoreData | false {
        if (this.optional) return false;
        if (this.items.some((i) => i.optional)) return false;
        return { selected: this.items.map((i) => i.uuid) };
    }

    /** @inheritDoc */
    override async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof ItemGrantData;
        const summary = await super.getSummary();
        summary.icon = ctor.ICON;

        // Fetch all items in parallel to avoid await-in-loop
        const fetchedItems = await Promise.all(this.items.map(async (cfg) => this._fetchItem(cfg.uuid)));

        for (const [idx, itemConfig] of this.items.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: fetchedItems is array-indexed
            const item = fetchedItems[idx] ?? null;
            if (item) {
                summary.details.push({
                    label: item.name,
                    value: item.type,
                    optional: itemConfig.optional,
                });
            } else {
                summary.details.push({
                    label: itemConfig.uuid,
                    value: 'Not found',
                    optional: itemConfig.optional,
                });
            }
        }

        return summary;
    }

    /** @inheritDoc */
    override validateGrant(): string[] {
        const errors = super.validateGrant();

        const items = this.items;

        if (items.length === 0) {
            errors.push('Item grant has no items configured');
        }

        for (const itemConfig of items) {
            if (itemConfig.uuid === '') {
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
     * @param {WH40KBaseActor} actor
     * @param {WH40KItem} sourceItem
     * @returns {boolean}
     * @private
     */
    _isDuplicate(actor: WH40KBaseActor, sourceItem: WH40KItem): boolean {
        return this._isDuplicateByName(actor, sourceItem.type, sourceItem.name, (sourceItem.system as { specialization?: string }).specialization);
    }

    /**
     * Duplicate check by name + specialization.
     * @private
     */
    _isDuplicateByName(actor: WH40KBaseActor, itemType: string, name: string, specialization?: string): boolean {
        const normSpec = (specialization ?? '').toString().toLowerCase().trim();
        return actor.items.some((i) => {
            if (i.type !== itemType || i.name !== name) return false;
            if (itemType !== 'talent') return true;
            // eslint-disable-next-line no-restricted-syntax -- boundary: i.system is cast to typed interface; specialization is genuinely optional (string | undefined) on talent items
            const actorSpec = ((i.system as { specialization?: string }).specialization ?? '').toString().toLowerCase().trim();
            return actorSpec === normSpec;
        });
    }

    /**
     * Create item data for granting.
     * @param {WH40KItem} sourceItem
     * @param {string} uuid
     * @param {Record<string, unknown>} overrides
     * @returns {Record<string, unknown>}
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: overrides and return value are Foundry toObject()/mergeObject() payloads; field-level types are item-type-specific
    _createItemData(sourceItem: WH40KItem, uuid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
        const itemData = sourceItem.toObject();

        // Apply overrides
        if (Object.keys(overrides).length > 0) {
            foundry.utils.mergeObject(itemData, overrides);
        }

        // Set grant flags
        itemData.flags = foundry.utils.mergeObject((itemData.flags as object | undefined) ?? {}, this._createGrantFlags(uuid));

        // Generate new ID
        itemData._id = foundry.utils.randomID();

        return itemData;
    }
}
