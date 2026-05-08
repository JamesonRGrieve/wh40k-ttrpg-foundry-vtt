/**
 * Grants Manager
 *
 * Coordinator for applying grants from items to actors.
 * Delegates to Grant DataModels for actual application logic.
 *
 * Replaces the monolithic GrantsProcessor with a cleaner architecture.
 */

import { createGrant } from '../data/grant/_module.ts';
import type BaseGrantData from '../data/grant/base-grant.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';

/**
 * Result of a grants application session.
 * @typedef {object} GrantsApplicationResult
 * @property {boolean} success - Whether all grants applied successfully
 * @property {object} appliedState - State for each grant that was applied
 * @property {string[]} notifications - Messages to display
 * @property {string[]} errors - Error messages
 */
interface GrantsApplicationResult {
    success: boolean;
    appliedState: Record<string, unknown>;
    notifications: string[];
    errors: string[];
    skipped?: boolean;
    reversed?: Record<string, unknown>;
}

/**
 * Generate a deterministic 16-character alphanumeric ID from a seed string.
 * Uses a simple hash to ensure the same input always produces the same output.
 * @param {string} seed - Input string to hash
 * @returns {string} 16-character alphanumeric ID
 */
export function generateDeterministicId(seed: string): string {
    // Simple string hash
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to positive number and base36
    const positive = Math.abs(hash);
    const base36 = positive.toString(36);

    // Pad or truncate to exactly 16 characters
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = base36;

    // Add more entropy from the seed if needed
    let seedIndex = 0;
    while (result.length < 16) {
        const charCode = seed.charCodeAt(seedIndex % seed.length);
        result += chars[charCode % chars.length];
        seedIndex++;
    }

    return result.substring(0, 16);
}

export class GrantsManager {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Maximum recursion depth for nested grants.
     * @type {number}
     */
    static maxDepth = 3;

    /* -------------------------------------------- */
    /*  Main Entry Points                           */
    /* -------------------------------------------- */

    /**
     * Apply all grants from an item to an actor.
     *
     * @param {WH40KItem} item - The item containing grants
     * @param {WH40KActor} actor - The actor to receive grants
     * @param {object} [options={}] - Application options
     * @param {object} [options.selections={}] - Player selections for choices
     * @param {object} [options.rolledValues={}] - Pre-rolled values for resources
     * @param {boolean} [options.dryRun=false] - Preview mode
     * @param {boolean} [options.force=false] - Bypass idempotency check
     * @param {boolean} [options.saveState=true] - Save applied state to actor flags
     * @param {number} [options.depth=0] - Current recursion depth
     * @returns {Promise<GrantsApplicationResult>}
     */
    static async applyItemGrants(item: WH40KItem, actor: WH40KBaseActor, options: Record<string, unknown> = {}): Promise<GrantsApplicationResult> {
        const result: GrantsApplicationResult = {
            success: true,
            appliedState: {},
            notifications: [],
            errors: [],
            skipped: false,
        };

        // Generate source key for tracking
        const itemName = item.name.replace(/\s+/g, '-');
        const sourceKey = item.uuid ?? item._id ?? item.id ?? `item-${itemName}`;

        // Idempotency check - skip if already applied (unless forced)
        if (options.force !== true && options.dryRun !== true && this.hasAppliedGrants(actor, sourceKey)) {
            game.wh40k.log(`GrantsManager: Grants from ${item.name} already applied, skipping`);
            const existingState = this.loadAppliedState(actor, sourceKey);
            result.appliedState = (existingState as Record<string, unknown>).grants as Record<string, unknown>;
            result.skipped = true;
            result.notifications.push(`Grants from ${item.name} already applied`);
            return result;
        }

        // Check recursion depth
        const depth = typeof options.depth === 'number' ? options.depth : 0;
        if (depth >= this.maxDepth) {
            console.warn(`GrantsManager: Max recursion depth reached for ${item.name}`);
            return result;
        }

        // Get grants from item
        const grants = this._extractGrants(item);
        if (grants.length === 0) {
            return result;
        }

        game.wh40k.log(`GrantsManager: Applying ${grants.length} grants from ${item.name}`);

        // Apply each grant
        for (const grantConfig of grants) {
            const grant = createGrant(grantConfig);
            if (!grant) {
                result.errors.push(`Failed to create grant of type "${grantConfig.type as string}"`);
                continue;
            }

            // Get selection data for this grant
            const selections = options.selections as Record<string, unknown> | undefined;
            const grantData = selections?.[grant._id] ?? {};

            // Check if grant can auto-apply
            const autoValue = grant.getAutomaticValue();
            const applyData = autoValue !== false ? autoValue : grantData;

            const grantResult = await grant.apply(actor, applyData as never, {
                dryRun: options.dryRun,
                depth: depth,
            });

            // Store state
            result.appliedState[grant._id] = {
                type: (grant.constructor as typeof BaseGrantData).TYPE,
                applied: grantResult.applied,
            };

            result.notifications.push(...grantResult.notifications);
            result.errors.push(...grantResult.errors);

            if (!grantResult.success) {
                result.success = false;
            }

            // Handle recursive grants from granted items
            if (grantConfig.type === 'item' && Object.keys(grantResult.applied).length > 0) {
                await this._processNestedGrants(actor, grantResult.applied, {
                    ...options,
                    depth: depth + 1,
                });
            }
        }

        // Save applied state to actor flags (unless dry run or explicitly disabled)
        const shouldSaveState = options.dryRun !== true && options.saveState !== false && depth === 0;
        if (shouldSaveState && Object.keys(result.appliedState).length > 0) {
            await this.saveAppliedState(actor, sourceKey, result.appliedState, {
                sourceName: item.name,
                sourceType: item.type,
            });
        }

        // Show notification summary
        if (options.dryRun !== true && result.notifications.length > 0 && options.showNotification !== false) {
            ui.notifications.info(`Applied grants from ${item.name}`);
        }

        return result;
    }

    /**
     * Reverse/undo all grants from an item.
     *
     * @param {WH40KItem} item - The item whose grants to reverse
     * @param {WH40KActor} actor - The actor to remove grants from
     * @param {object} appliedState - State from when grants were applied
     * @returns {Promise<object>} Restore data for re-applying
     */
    static async reverseItemGrants(item: WH40KItem, actor: WH40KBaseActor, appliedState: Record<string, unknown>): Promise<Record<string, unknown>> {
        const restoreData: Record<string, unknown> = {};

        const grants = this._extractGrants(item);

        // Reverse in reverse order
        for (const grantConfig of grants.reverse()) {
            const state = appliedState[grantConfig._id as string] as Record<string, unknown> | undefined;
            if (!state) continue;

            const grant = createGrant(grantConfig);
            if (!grant) continue;

            restoreData[grantConfig._id as string] = await (grant.reverse as (actor: WH40KBaseActor, state: Record<string, unknown>) => Promise<unknown>)(
                actor,
                state.applied as Record<string, unknown>,
            );
        }

        return restoreData;
    }

    /**
     * Get a preview/summary of what an item would grant.
     *
     * @param {WH40KItem} item - The item to preview
     * @returns {Promise<object>} Summary of grants
     */
    static async getGrantsSummary(item: WH40KItem): Promise<{ item: string; grants: unknown[] }> {
        const summary: { item: string; grants: unknown[] } = {
            item: item.name,
            grants: [],
        };

        const grants = this._extractGrants(item);

        for (const grantConfig of grants) {
            const grant = createGrant(grantConfig);
            if (grant) {
                summary.grants.push(await grant.getSummary());
            }
        }

        return summary;
    }

    /**
     * Validate all grants on an item.
     *
     * @param {WH40KItem} item - The item to validate
     * @returns {string[]} Array of validation errors
     */
    static validateItemGrants(item: WH40KItem): string[] {
        const errors: string[] = [];
        const grants = this._extractGrants(item);

        for (const grantConfig of grants) {
            const grant = createGrant(grantConfig);
            if (!grant) {
                errors.push(`Invalid grant type: ${grantConfig.type as string}`);
                continue;
            }
            errors.push(...grant.validateGrant());
        }

        return errors;
    }

    /* -------------------------------------------- */
    /*  Batch Processing (for Origin Path Builder)  */
    /* -------------------------------------------- */

    /**
     * Process grants from multiple items in batch.
     * Used by origin path builder to apply all selected origins at once.
     *
     * @param {WH40KItem[]} items - Array of items with grants
     * @param {WH40KActor} actor - The actor to receive grants
     * @param {object} [options={}] - Application options
     * @param {boolean} [options.reverseExisting=false] - Reverse all existing grants before applying
     * @returns {Promise<GrantsApplicationResult>}
     */
    static async applyBatchGrants(items: WH40KItem[], actor: WH40KBaseActor, options: Record<string, unknown> = {}): Promise<GrantsApplicationResult> {
        const result: GrantsApplicationResult = {
            success: true,
            appliedState: {},
            notifications: [],
            errors: [],
            reversed: {},
        };

        // Reverse existing grants if requested
        if (options.reverseExisting === true) {
            game.wh40k.log(`GrantsManager: Reversing existing grants before batch apply`);
            const reverseResult = await this.reverseAllAppliedGrants(actor);
            result.reversed = reverseResult.reversed;
            result.notifications.push(...reverseResult.notifications);
            result.errors.push(...reverseResult.errors);

            if (!reverseResult.success) {
                console.warn('GrantsManager: Some grants failed to reverse, continuing anyway');
            }
        }

        // Apply grants from each item in order
        for (const item of items) {
            const itemResult = await this.applyItemGrants(item, actor, {
                ...options,
                showNotification: false, // Suppress per-item notifications
                force: options.reverseExisting, // Force apply if we reversed
            });

            // Use item.id, item._id, or generate a key from name
            const itemKey = item.id ?? item._id ?? `item-${item.name.replace(/\s+/g, '-')}`;
            result.appliedState[itemKey] = itemResult.appliedState;
            result.notifications.push(...itemResult.notifications);
            result.errors.push(...itemResult.errors);

            if (!itemResult.success) {
                result.success = false;
            }
        }

        // Show combined notification
        if (options.dryRun !== true && result.notifications.length > 0 && options.showNotification !== false) {
            ui.notifications.info(`Applied grants from ${items.length} items`);
        }

        return result;
    }

    /* -------------------------------------------- */
    /*  State Persistence (Actor Flags)             */
    /* -------------------------------------------- */

    /**
     * Flag path for storing applied grants on actor.
     * @type {string}
     */
    static flagKey = 'appliedGrants';

    /**
     * Save applied grant state to actor flags.
     *
     * @param {WH40KActor} actor - The actor
     * @param {string} sourceKey - Unique key for the source (UUID or item key)
     * @param {object} state - The applied state to save
     * @param {object} [metadata={}] - Additional metadata
     * @returns {Promise<void>}
     */
    static async saveAppliedState(actor: WH40KBaseActor, sourceKey: string, state: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
        const flagData = {
            appliedAt: Date.now(),
            sourceName: metadata.sourceName ?? sourceKey,
            sourceType: metadata.sourceType ?? 'unknown',
            grants: state,
        };

        // Sanitize the key for use in flag path (remove dots, special chars)
        const safeKey = this._sanitizeKey(sourceKey);

        await actor.setFlag('wh40k-rpg', `${this.flagKey}.${safeKey}`, flagData);
        game.wh40k.log(`GrantsManager: Saved applied state for ${sourceKey}`);
    }

    /**
     * Load applied grant state from actor flags.
     *
     * @param {WH40KActor} actor - The actor
     * @param {string} [sourceKey] - Optional source key to load specific grants
     * @returns {object|null} The applied state, or null if not found
     */
    static loadAppliedState(actor: WH40KBaseActor, sourceKey: string | null = null): Record<string, unknown> | null {
        const allGrants = (actor.getFlag('wh40k-rpg', this.flagKey) ?? {}) as Record<string, unknown>;

        if (sourceKey !== null) {
            const safeKey = this._sanitizeKey(sourceKey);
            const entry = allGrants[safeKey];
            return entry !== undefined ? (entry as Record<string, unknown>) : null;
        }

        return allGrants;
    }

    /**
     * Clear applied grant state from actor flags.
     *
     * @param {WH40KActor} actor - The actor
     * @param {string} [sourceKey] - Optional source key to clear specific grants
     * @returns {Promise<void>}
     */
    static async clearAppliedState(actor: WH40KBaseActor, sourceKey: string | null = null): Promise<void> {
        if (sourceKey !== null) {
            const safeKey = this._sanitizeKey(sourceKey);
            await actor.unsetFlag('wh40k-rpg', `${this.flagKey}.${safeKey}`);
            game.wh40k.log(`GrantsManager: Cleared applied state for ${sourceKey}`);
        } else {
            await actor.unsetFlag('wh40k-rpg', this.flagKey);
            game.wh40k.log(`GrantsManager: Cleared all applied grant state`);
        }
    }

    /**
     * Check if grants from a source have already been applied.
     *
     * @param {WH40KActor} actor - The actor
     * @param {string} sourceKey - The source key to check
     * @returns {boolean}
     */
    static hasAppliedGrants(actor: WH40KBaseActor, sourceKey: string): boolean {
        const state = this.loadAppliedState(actor, sourceKey);
        return state !== null && typeof state.grants === 'object' && state.grants !== null && Object.keys(state.grants).length > 0;
    }

    /**
     * Sanitize a key for use in flag paths.
     * @param {string} key
     * @returns {string}
     * @private
     */
    static _sanitizeKey(key: string): string {
        // Replace dots and special characters with underscores
        return key.replace(/[./\\]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    }

    /* -------------------------------------------- */
    /*  Reversal & Reset                            */
    /* -------------------------------------------- */

    /**
     * Reverse all applied grants from a specific source.
     *
     * @param {WH40KActor} actor - The actor
     * @param {string} sourceKey - The source key to reverse
     * @returns {Promise<object>} Result of the reversal
     */
    static async reverseAppliedGrants(
        actor: WH40KBaseActor,
        sourceKey: string,
    ): Promise<{ success: boolean; reversed: Record<string, unknown>; notifications: string[]; errors: string[] }> {
        const result = {
            success: true,
            reversed: {} as Record<string, unknown>,
            notifications: [] as string[],
            errors: [] as string[],
        };

        const appliedData = this.loadAppliedState(actor, sourceKey);
        if (appliedData === null) {
            result.notifications.push(`No applied grants found for ${sourceKey}`);
            return result;
        }

        game.wh40k.log(`GrantsManager: Reversing grants from ${typeof appliedData.sourceName === 'string' ? appliedData.sourceName : sourceKey}`);

        // Reverse each grant in reverse order
        const grantsMap = (appliedData.grants ?? {}) as Record<string, unknown>;
        const grantIds = Object.keys(grantsMap).reverse();

        for (const grantId of grantIds) {
            const grantState = grantsMap[grantId] as Record<string, unknown> | undefined;
            if (grantState === undefined) continue;

            try {
                const reversed = await this._reverseGrant(actor, grantId, grantState);
                result.reversed[grantId] = reversed;
                if (Array.isArray(reversed.notifications)) {
                    result.notifications.push(...(reversed.notifications as string[]));
                }
            } catch (err) {
                console.error(`GrantsManager: Failed to reverse grant ${grantId}:`, err);
                result.errors.push(`Failed to reverse grant: ${(err as Error).message}`);
            }
        }

        // Clear the applied state
        await this.clearAppliedState(actor, sourceKey);

        result.success = result.errors.length === 0;
        return result;
    }

    /**
     * Reverse all applied grants from all sources (full reset).
     *
     * @param {WH40KActor} actor - The actor
     * @returns {Promise<object>} Result of the reversal
     */
    static async reverseAllAppliedGrants(
        actor: WH40KBaseActor,
    ): Promise<{ success: boolean; reversed: Record<string, unknown>; notifications: string[]; errors: string[] }> {
        const result = {
            success: true,
            reversed: {} as Record<string, unknown>,
            notifications: [] as string[],
            errors: [] as string[],
        };

        const allApplied = this.loadAppliedState(actor);
        if (allApplied === null || Object.keys(allApplied).length === 0) {
            result.notifications.push('No applied grants to reverse');
            return result;
        }

        game.wh40k.log(`GrantsManager: Reversing all applied grants (${Object.keys(allApplied).length} sources)`);

        // Reverse each source in reverse order (most recent first)
        const sourceKeys = Object.keys(allApplied).reverse();

        for (const sourceKey of sourceKeys) {
            const sourceResult = await this.reverseAppliedGrants(actor, sourceKey);
            result.reversed[sourceKey] = sourceResult.reversed;
            result.notifications.push(...sourceResult.notifications);
            result.errors.push(...sourceResult.errors);

            if (!sourceResult.success) {
                result.success = false;
            }
        }

        return result;
    }

    /**
     * Reverse a single grant.
     * @param {WH40KActor} actor
     * @param {string} grantId
     * @param {object} grantState
     * @returns {Promise<object>}
     * @private
     */
    static async _reverseGrant(actor: WH40KBaseActor, grantId: string, grantState: Record<string, unknown>): Promise<Record<string, unknown>> {
        const { type, applied } = grantState;
        const result: { notifications: string[] } = { notifications: [] };

        switch (type) {
            case 'characteristic':
                await this._reverseCharacteristicGrant(actor, applied as Record<string, unknown>, result);
                break;

            case 'skill':
                await this._reverseSkillGrant(actor, applied as Record<string, unknown>, result);
                break;

            case 'item':
                await this._reverseItemGrant(actor, applied as Record<string, unknown>, result);
                break;

            case 'resource':
                await this._reverseResourceGrant(actor, applied as Record<string, unknown>, result);
                break;

            case 'choice':
                // Choice grants contain nested grants, reverse them
                if ((applied as Record<string, unknown>).grantResults !== undefined) {
                    const nestedResults = (applied as Record<string, unknown>).grantResults as Record<string, Record<string, unknown>>;
                    for (const [key, nestedState] of Object.entries(nestedResults)) {
                        await this._reverseGrant(actor, key, { type: nestedState.type, applied: nestedState.applied });
                    }
                }
                break;

            default:
                console.warn(`GrantsManager: Unknown grant type to reverse: ${type as string} (grantId=${grantId})`);
        }

        return result;
    }

    /**
     * Reverse characteristic grant.
     * @private
     */
    static async _reverseCharacteristicGrant(actor: WH40KBaseActor, applied: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
        const updates: Record<string, unknown> = {};

        for (const [key, state] of Object.entries(applied) as [string, Record<string, unknown>][]) {
            if (state.previousValue !== undefined) {
                updates[`system.characteristics.${key}.advance`] = state.previousValue;
                (result.notifications as string[]).push(`Reversed ${key}: ${state.newValue as number} → ${state.previousValue as number}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
    }

    /**
     * Reverse skill grant.
     * @private
     */
    static async _reverseSkillGrant(actor: WH40KBaseActor, applied: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
        const idsToDelete: string[] = [];
        const itemsToUpdate: Record<string, unknown>[] = [];

        for (const [key, state] of Object.entries(applied) as [string, Record<string, unknown>][]) {
            if (state.created === true && state.itemId !== undefined) {
                // Delete created skill
                idsToDelete.push(state.itemId as string);
                (result.notifications as string[]).push(`Removed skill: ${key}`);
            } else if (state.upgraded === true && state.itemId !== undefined && state.previousLevel !== undefined) {
                // Revert upgrade
                const updates = this._getSkillLevelUpdates(state.previousLevel as string);
                itemsToUpdate.push({ _id: state.itemId, ...updates });
                (result.notifications as string[]).push(`Reverted skill ${key} to ${state.previousLevel as string}`);
            }
        }

        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }

        if (itemsToUpdate.length > 0) {
            await actor.updateEmbeddedDocuments('Item', itemsToUpdate);
        }
    }

    /**
     * Reverse item grant.
     * @private
     */
    static async _reverseItemGrant(actor: WH40KBaseActor, applied: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
        const idsToDelete: string[] = [];

        for (const [, itemId] of Object.entries(applied) as [string, string][]) {
            if (actor.items.has(itemId)) {
                const item = actor.items.get(itemId);
                idsToDelete.push(itemId);
                (result.notifications as string[]).push(`Removed: ${item?.name}`);
            }
        }

        if (idsToDelete.length > 0) {
            await actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }
    }

    /**
     * Reverse resource grant.
     * @private
     */
    static async _reverseResourceGrant(actor: WH40KBaseActor, applied: Record<string, unknown>, result: Record<string, unknown>): Promise<void> {
        const updates: Record<string, unknown> = {};

        const resourcePaths: Partial<Record<string, { value: string; max?: string }>> = {
            wounds: { value: 'system.wounds.value', max: 'system.wounds.max' },
            fate: { value: 'system.fatePoints.value', max: 'system.fatePoints.max' },
            corruption: { value: 'system.corruption.value' },
            insanity: { value: 'system.insanity.value' },
        };

        for (const [resourceType, state] of Object.entries(applied) as [string, Record<string, unknown>][]) {
            const paths = resourcePaths[resourceType];
            if (paths === undefined) continue;

            if (state.previousValue !== undefined) {
                updates[paths.value] = state.previousValue;
            }
            if (state.previousMax !== undefined && paths.max !== undefined) {
                updates[paths.max] = state.previousMax;
            }

            (result.notifications as string[]).push(`Reversed ${resourceType}`);
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
    }

    /**
     * Get skill level update data.
     * @private
     */
    static _getSkillLevelUpdates(level: string): Record<string, boolean> {
        const updates: Record<string, boolean> = {
            'system.trained': false,
            'system.plus10': false,
            'system.plus20': false,
        };

        switch (level) {
            case 'plus20':
                updates['system.plus20'] = true;
            // Fall through
            case 'plus10':
                updates['system.plus10'] = true;
            // Fall through
            case 'trained':
                updates['system.trained'] = true;
                break;
        }

        return updates;
    }

    /* -------------------------------------------- */
    /*  Private Helper Methods                      */
    /* -------------------------------------------- */

    /**
     * Extract grants configuration from an item.
     * @param {WH40KItem} item
     * @returns {object[]}
     * @private
     */
    static _extractGrants(item: WH40KItem): Record<string, unknown>[] {
        const system = item.system as unknown as { grantsV2?: unknown[] };
        if (Array.isArray(system.grantsV2)) {
            return system.grantsV2 as Record<string, unknown>[];
        }
        return [];
    }

    /**
     * Process nested grants from granted items.
     * @param {WH40KActor} actor
     * @param {object} appliedItems - Map of UUID to item ID
     * @param {object} options
     * @private
     */
    static async _processNestedGrants(actor: WH40KBaseActor, appliedItems: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        for (const [, itemId] of Object.entries(appliedItems)) {
            const item = actor.items.get(itemId as string);
            if (!item) continue;

            // Check if the granted item has its own grants
            const grants = this._extractGrants(item);
            if (grants.length > 0) {
                game.wh40k.log(`GrantsManager: Processing nested grants from ${item.name}`);
                await this.applyItemGrants(item, actor, options);
            }
        }
    }
}

// Export for convenience
export default GrantsManager;
