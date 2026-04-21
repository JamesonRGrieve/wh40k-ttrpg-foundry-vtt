import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import BaseGrantData, { GrantApplicationResult, GrantSummary } from './base-grant.ts';

/**
 * Interface for a single item grant configuration.
 */
interface ItemGrantConfig {
    uuid: string;
    optional: boolean;
    overrides?: Record<string, any>;
    // Legacy support fields
    _legacyName?: string;
    _legacySpecialization?: string;
}

/**
 * Interface for the state of an applied item grant.
 */
interface ItemAppliedState {
    uuid: string;
    itemId: string;
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
    static override defineSchema(): Record<string, foundry.data.fields.DataField> {
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
                    // Legacy support fields
                    _legacyName: new fields.StringField({ required: false, blank: true }),
                    _legacySpecialization: new fields.StringField({ required: false, blank: true }),
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
    override async _applyGrant(
        actor: WH40KBaseActor,
        data: Record<string, unknown>,
        options: Record<string, unknown>,
        result: GrantApplicationResult,
    ): Promise<void> {
        const ctor = this.constructor as typeof ItemGrantData;
        const items = this.items ?? [];
        if (items.length === 0) {
            result.notifications.push('Item grant has no items to apply');
            return;
        }

        const itemsToCreate: Array<{ uuid: string; data: Record<string, any> }> = [];
        const selectedUuids = (data.selected as string[]) ?? items.map((i) => i.uuid);

        for (const itemConfig of items) {
            const { uuid, optional, overrides, _legacyName, _legacySpecialization } = itemConfig;

            // Try to find the item - first by UUID, then by name
            let sourceItem: WH40KItem | null = null;
            let resolvedUuid = uuid;

            if (uuid) {
                sourceItem = await this._fetchItem(uuid);
            }

            // Fallback: lookup by name if no UUID or UUID not found
            if (!sourceItem && _legacyName) {
                sourceItem = (await this._findItemByName(_legacyName, _legacySpecialization)) as WH40KItem | null;
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
            if (!ctor.VALID_TYPES.has(sourceItem.type)) {
                result.errors.push(`Invalid item type "${sourceItem.type}" for ${sourceItem.name}`);
                continue;
            }

            // Create item data, applying specialization if present
            const effectiveOverrides = { ...(overrides ?? {}) };
            if (_legacySpecialization && sourceItem.type === 'talent') {
                effectiveOverrides['system.specialization'] = _legacySpecialization;
                // Strip any pre-existing "(X)" suffix so we don't produce "Name (X) (X)" or "Name (X) (Y)"
                // when the compendium source or lookup path returns an already-specialized item.
                const bareName = sourceItem.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
                effectiveOverrides['name'] = `${bareName} (${_legacySpecialization})`;
            }

            // Check for duplicates against the *final* name+specialization, not the bare source.
            // Otherwise granting Weapon Training with specialization "Shock" re-runs create
            // additional copies because the actor item name "(Shock)" never matched bare "Weapon Training".
            const effectiveName = (effectiveOverrides['name'] as string) ?? sourceItem.name;
            const effectiveSpec =
                (effectiveOverrides['system.specialization'] as string | undefined) ??
                (sourceItem.system as { specialization?: string } | undefined)?.specialization;
            if (this._isDuplicateByName(actor, sourceItem.type, effectiveName, effectiveSpec)) {
                result.notifications.push(`${effectiveName} already exists, skipping`);
                continue;
            }

            const itemData = this._createItemData(sourceItem, resolvedUuid, effectiveOverrides);
            itemsToCreate.push({ uuid: resolvedUuid, data: itemData });
        }

        // Apply if not dry run
        if (!options.dryRun && itemsToCreate.length > 0) {
            const created = (await actor.createEmbeddedDocuments(
                'Item',
                itemsToCreate.map((i) => i.data),
            )) as WH40KItem[];

            // Track what was applied
            created.forEach((item, index) => {
                const sourceUuid = itemsToCreate[index].uuid;
                result.applied[sourceUuid] = item.id!;
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
    override async reverse(
        actor: WH40KBaseActor,
        appliedState: Record<string, string>,
    ): Promise<{ items: Array<{ uuid: string; data: Record<string, unknown> }> }> {
        const restoreData: { items: Array<{ uuid: string; data: Record<string, unknown> }> } = { items: [] };
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
    override async restore(
        actor: WH40KBaseActor,
        restoreData: { items: Array<{ uuid: string; data: Record<string, unknown> }> },
    ): Promise<GrantApplicationResult> {
        const result = this._initResult();
        const items = restoreData?.items ?? [];
        if (items.length === 0) return result;

        const created = (await actor.createEmbeddedDocuments(
            'Item',
            items.map((i) => i.data),
        )) as WH40KItem[];

        created.forEach((item, index) => {
            result.applied[items[index].uuid] = item.id!;
            result.notifications.push(`Restored: ${item.name}`);
        });

        return result;
    }

    /** @inheritDoc */
    override getAutomaticValue(): Record<string, unknown> | false {
        if (this.optional) return false;
        if (this.items.some((i) => i.optional)) return false;
        return { selected: this.items.map((i) => i.uuid) };
    }

    /** @inheritDoc */
    override async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof ItemGrantData;
        const summary = await super.getSummary();
        summary.icon = ctor.ICON;

        for (const itemConfig of this.items) {
            const item = await this._fetchItem(itemConfig.uuid);
            if (item) {
                summary.details.push({
                    label: item.name ?? '',
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
     * @param {WH40KBaseActor} actor
     * @param {WH40KItem} sourceItem
     * @returns {boolean}
     * @private
     */
    _isDuplicate(actor: WH40KBaseActor, sourceItem: WH40KItem): boolean {
        return this._isDuplicateByName(actor, sourceItem.type, sourceItem.name, (sourceItem.system as { specialization?: string })?.specialization);
    }

    /**
     * Duplicate check using the final name + specialization the grant will produce.
     * Necessary because _legacySpecialization rewrites the actor-item name.
     * @private
     */
    _isDuplicateByName(actor: WH40KBaseActor, itemType: string, name: string, specialization?: string): boolean {
        const normSpec = (specialization ?? '').toString().toLowerCase().trim();
        return actor.items.some((i) => {
            if (i.type !== itemType || i.name !== name) return false;
            if (itemType !== 'talent') return true;
            const actorSpec = ((i.system as { specialization?: string })?.specialization ?? '').toString().toLowerCase().trim();
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
    _createItemData(sourceItem: WH40KItem, uuid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
        const itemData = sourceItem.toObject();

        // Apply overrides
        if (overrides && Object.keys(overrides).length > 0) {
            foundry.utils.mergeObject(itemData, overrides);
        }

        // Set grant flags
        itemData.flags = foundry.utils.mergeObject((itemData.flags ?? {}) as Record<string, unknown>, this._createGrantFlags(uuid));

        // Generate new ID
        itemData._id = foundry.utils.randomID();

        return itemData;
    }

    /**
     * Find an item by name in compendiums.
     * Used as fallback when UUID is not available.
     * @param {string} name - Item name to search for
     * @param {string} [specialization] - Optional specialization for talents
     * @returns {Promise<WH40KItem|null>}
     * @private
     */
    async _findItemByName(name: string, specialization = ''): Promise<WH40KItem | null> {
        if (!name) return null;

        const nameLower = name.toLowerCase();
        const compositeLower = specialization ? `${name} (${specialization})`.toLowerCase() : '';

        // Search all Item packs — talents/traits/gear are spread across
        // system-specific packs (dh2-core-stats-talents, rt-core-items-traits, etc.)
        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;

            const index = await pack.getIndex();

            const match = index.find((entry: { name: string }) => {
                const entryLower = entry.name.toLowerCase();
                if (entryLower === nameLower) return true;
                if (compositeLower && entryLower === compositeLower) return true;
                return false;
            });

            if (match) {
                return (await pack.getDocument(match._id)) as WH40KItem | null;
            }
        }

        return null;
    }
}
