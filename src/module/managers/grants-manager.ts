/**
 * Grants Manager
 *
 * Coordinator for applying grants from items to actors.
 * Delegates to Grant DataModels for actual application logic.
 *
 * Replaces the monolithic GrantsProcessor with a cleaner architecture.
 */

import { createGrant, type GrantConfig } from '../data/grant/_module.ts';
import type BaseGrantData from '../data/grant/base-grant.ts';
import type { GrantAppliedEntry } from '../data/grant/base-grant.ts'; // eslint-disable-line no-duplicate-imports -- separate type-only named import; TS does not allow merging default-type with named-type in one declaration
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';

/**
 * Single applied-grant entry stored on the actor flag. `type` matches a grant
 * subclass `TYPE` (`characteristic`, `skill`, `item`, `resource`, `choice`);
 * `applied` is the subclass-defined `applied` map from {@link GrantApplicationResult}.
 */
interface AppliedGrantStateEntry {
    type: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: applied state is subclass-defined; narrow at the type-specific reverse helper
    applied: Record<string, GrantAppliedEntry>;
}

/** Map of grant id → applied state. Used as the `appliedState` field on results. */
type AppliedGrantState = Record<string, AppliedGrantStateEntry>;

/** Map of source key → applied-grant map (one source = one item). */
type BatchAppliedState = Record<string, AppliedGrantState>;

/** Flag payload stored at `flags.wh40k-rpg.appliedGrants.<safeKey>`. */
interface AppliedGrantsFlagEntry {
    appliedAt: number;
    sourceName: string;
    sourceType: string;
    grants: AppliedGrantState;
}

/** Metadata accepted when saving applied state. */
interface SaveAppliedMetadata {
    sourceName?: string;
    sourceType?: string;
}

/**
 * Result of a grants application session.
 */
interface GrantsApplicationResult {
    success: boolean;
    appliedState: AppliedGrantState | BatchAppliedState;
    notifications: string[];
    errors: string[];
    skipped?: boolean;
    reversed?: Record<string, GrantReverseResult>;
}

/**
 * Per-grant selection payload passed into `apply` — keyed by grant id.
 * Values are opaque at the manager boundary; each grant subclass interprets its own entry.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied per-grant payloads are subclass-specific (origin path builder, advancement dialog, character creation)
type GrantSelections = Record<string, unknown>;

/** Options accepted by {@link GrantsManager.applyItemGrants}. */
interface ApplyItemGrantsOptions {
    selections?: GrantSelections;
    // eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied rolled-value payload; resource-grant subclass narrows per-key
    rolledValues?: Record<string, unknown>;
    dryRun?: boolean;
    force?: boolean;
    saveState?: boolean;
    depth?: number;
    showNotification?: boolean;
}

/** Options accepted by {@link GrantsManager.applyBatchGrants}. */
interface ApplyBatchGrantsOptions extends ApplyItemGrantsOptions {
    reverseExisting?: boolean;
}

/** Result of a single-grant reverse operation. */
interface GrantReverseResult {
    notifications: string[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-grant restore payload returned by createGrant().reverse(); subclass-specific
    reversed?: Record<string, unknown>;
}

/** Result of {@link GrantsManager.reverseAppliedGrants} / `reverseAllAppliedGrants`. */
interface ReverseGrantsResult {
    success: boolean;
    reversed: Record<string, GrantReverseResult>;
    notifications: string[];
    errors: string[];
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
    // eslint-disable-next-line complexity -- orchestrator: idempotency guard + depth guard + per-grant application + recursion + persistence + notifications
    static async applyItemGrants(item: WH40KItem, actor: WH40KBaseActor, options: ApplyItemGrantsOptions = {}): Promise<GrantsApplicationResult> {
        const appliedState: AppliedGrantState = {};
        const result: GrantsApplicationResult = {
            success: true,
            appliedState,
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
            if (existingState !== null) {
                result.appliedState = existingState.grants;
            }
            result.skipped = true;
            result.notifications.push(`Grants from ${item.name} already applied`);
            return result;
        }

        // Check recursion depth
        const depth = options.depth ?? 0;
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
                const grantType = typeof grantConfig.type === 'string' ? grantConfig.type : '(none)';
                result.errors.push(`Failed to create grant of type "${grantType}"`);
                continue;
            }

            // Get selection data for this grant
            const rawSelection = options.selections?.[grant._id];
            // eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied selection payload; shape validated by createGrant() per-subclass
            const grantData: GrantConfig = (
                rawSelection !== undefined && rawSelection !== null && typeof rawSelection === 'object' ? rawSelection : {}
            ) as GrantConfig;

            // Check if grant can auto-apply
            const autoValue = grant.getAutomaticValue();
            const applyData = autoValue !== false ? autoValue : grantData;

            // eslint-disable-next-line no-await-in-loop -- grants must apply in source order; later grants can depend on earlier ones (e.g. item-grant followed by skill-grant on that item)
            const grantResult = await grant.apply(actor, applyData, {
                dryRun: Boolean(options.dryRun),
                depth: depth,
            });

            // Store state
            appliedState[grant._id] = {
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
                // eslint-disable-next-line no-await-in-loop -- nested grants must complete before the next sibling grant runs (ordering matters)
                await this._processNestedGrants(actor, grantResult.applied, {
                    ...options,
                    depth: depth + 1,
                });
            }
        }

        // Save applied state to actor flags (unless dry run or explicitly disabled)
        const shouldSaveState = options.dryRun !== true && options.saveState !== false && depth === 0;
        if (shouldSaveState && Object.keys(appliedState).length > 0) {
            await this.saveAppliedState(actor, sourceKey, appliedState, {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-grant restore payload returned by createGrant().reverse() is subclass-specific
    static async reverseItemGrants(item: WH40KItem, actor: WH40KBaseActor, appliedState: AppliedGrantState): Promise<Record<string, unknown>> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: see return-type comment above
        const restoreData: Record<string, unknown> = {};

        const grants = this._extractGrants(item);

        // Reverse in reverse order
        for (const grantConfig of grants.reverse()) {
            const grantId = typeof grantConfig['_id'] === 'string' ? grantConfig['_id'] : '';
            if (grantId === '' || !(grantId in appliedState)) continue;
            const state = appliedState[grantId] as (typeof appliedState)[string] | undefined;
            if (state === undefined) continue;

            const grant = createGrant(grantConfig);
            if (!grant) continue;

            // eslint-disable-next-line no-await-in-loop -- grants must be reversed sequentially in source-defined order
            restoreData[grantId] = await grant.reverse(actor, state.applied);
        }

        return restoreData;
    }

    /**
     * Get a preview/summary of what an item would grant.
     *
     * @param {WH40KItem} item - The item to preview
     * @returns {Promise<object>} Summary of grants
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: grant.getSummary() returns subclass-specific summary payloads
    static async getGrantsSummary(item: WH40KItem): Promise<{ item: string; grants: unknown[] }> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: see return-type comment above
        const summary: { item: string; grants: unknown[] } = {
            item: item.name,
            grants: [],
        };

        const grants = this._extractGrants(item);

        for (const grantConfig of grants) {
            const grant = createGrant(grantConfig);
            if (grant) {
                // eslint-disable-next-line no-await-in-loop -- summaries are produced sequentially; grant order is preserved
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
                const grantType = typeof grantConfig.type === 'string' ? grantConfig.type : '(none)';
                errors.push(`Invalid grant type: ${grantType}`);
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
    static async applyBatchGrants(items: WH40KItem[], actor: WH40KBaseActor, options: ApplyBatchGrantsOptions = {}): Promise<GrantsApplicationResult> {
        const batchState: BatchAppliedState = {};
        const result: GrantsApplicationResult = {
            success: true,
            appliedState: batchState,
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
            // eslint-disable-next-line no-await-in-loop -- batch apply preserves item order; later items can reference earlier-granted items
            const itemResult = await this.applyItemGrants(item, actor, {
                ...options,
                showNotification: false, // Suppress per-item notifications
                force: options.reverseExisting, // Force apply if we reversed
            });

            // Use item.id, item._id, or generate a key from name
            const itemKey = item.id ?? item._id ?? `item-${item.name.replace(/\s+/g, '-')}`;
            batchState[itemKey] = itemResult.appliedState as AppliedGrantState;
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
    static async saveAppliedState(actor: WH40KBaseActor, sourceKey: string, state: AppliedGrantState, metadata: SaveAppliedMetadata = {}): Promise<void> {
        const flagData: AppliedGrantsFlagEntry = {
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
    static loadAppliedState(actor: WH40KBaseActor): Record<string, AppliedGrantsFlagEntry>;
    static loadAppliedState(actor: WH40KBaseActor, sourceKey: string): AppliedGrantsFlagEntry | null;
    static loadAppliedState(actor: WH40KBaseActor, sourceKey: string | null): AppliedGrantsFlagEntry | Record<string, AppliedGrantsFlagEntry> | null;
    static loadAppliedState(actor: WH40KBaseActor, sourceKey: string | null = null): AppliedGrantsFlagEntry | Record<string, AppliedGrantsFlagEntry> | null {
        const raw = actor.getFlag('wh40k-rpg', this.flagKey);
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.getFlag returns Foundry's untyped flag payload
        const allGrants: Record<string, AppliedGrantsFlagEntry> = raw !== undefined && raw !== null ? (raw as Record<string, AppliedGrantsFlagEntry>) : {};

        if (sourceKey !== null) {
            const safeKey = this._sanitizeKey(sourceKey);
            return allGrants[safeKey] ?? null;
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
        return state !== null && Object.keys(state.grants).length > 0;
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
    static async reverseAppliedGrants(actor: WH40KBaseActor, sourceKey: string): Promise<ReverseGrantsResult> {
        const result: ReverseGrantsResult = {
            success: true,
            reversed: {},
            notifications: [],
            errors: [],
        };

        const appliedData = this.loadAppliedState(actor, sourceKey);
        if (appliedData === null) {
            result.notifications.push(`No applied grants found for ${sourceKey}`);
            return result;
        }

        game.wh40k.log(`GrantsManager: Reversing grants from ${appliedData.sourceName}`);

        // Reverse each grant in reverse order
        const grantsMap = appliedData.grants;
        const grantIds = Object.keys(grantsMap).reverse();

        for (const grantId of grantIds) {
            const grantState = grantsMap[grantId];

            try {
                // eslint-disable-next-line no-await-in-loop -- reversal must run in reverse application order
                const reversed = await this._reverseGrant(actor, grantId, grantState);
                result.reversed[grantId] = reversed;
                result.notifications.push(...reversed.notifications);
            } catch (err) {
                console.error(`GrantsManager: Failed to reverse grant ${grantId}:`, err);
                const message = err instanceof Error ? err.message : String(err);
                result.errors.push(`Failed to reverse grant: ${message}`);
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
    static async reverseAllAppliedGrants(actor: WH40KBaseActor): Promise<ReverseGrantsResult> {
        const result: ReverseGrantsResult = {
            success: true,
            reversed: {},
            notifications: [],
            errors: [],
        };

        const allApplied = this.loadAppliedState(actor);
        if (Object.keys(allApplied).length === 0) {
            result.notifications.push('No applied grants to reverse');
            return result;
        }

        game.wh40k.log(`GrantsManager: Reversing all applied grants (${Object.keys(allApplied).length} sources)`);

        // Reverse each source in reverse order (most recent first)
        const sourceKeys = Object.keys(allApplied).reverse();

        for (const sourceKey of sourceKeys) {
            // eslint-disable-next-line no-await-in-loop -- sources must be reversed sequentially (most recent first) to preserve ordering invariants
            const sourceResult = await this.reverseAppliedGrants(actor, sourceKey);
            // Roll the per-source reversed map up into a single notifications/errors stream
            result.reversed[sourceKey] = {
                notifications: sourceResult.notifications,
                reversed: sourceResult.reversed,
            };
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
    static async _reverseGrant(actor: WH40KBaseActor, grantId: string, grantState: AppliedGrantStateEntry): Promise<GrantReverseResult> {
        const { type, applied } = grantState;
        const result: GrantReverseResult = { notifications: [] };

        switch (type) {
            case 'characteristic':
                await this._reverseCharacteristicGrant(actor, applied, result);
                break;

            case 'skill':
                await this._reverseSkillGrant(actor, applied, result);
                break;

            case 'item':
                await this._reverseItemGrant(actor, applied, result);
                break;

            case 'resource':
                await this._reverseResourceGrant(actor, applied, result);
                break;

            case 'choice': {
                // Choice grants contain nested grants, reverse them
                const choiceApplied = applied as { grantResults?: Record<string, AppliedGrantStateEntry> };
                if (choiceApplied.grantResults !== undefined) {
                    for (const [key, nestedState] of Object.entries(choiceApplied.grantResults)) {
                        // eslint-disable-next-line no-await-in-loop -- nested grants must reverse sequentially
                        await this._reverseGrant(actor, key, nestedState);
                    }
                }
                break;
            }

            default:
                console.warn(`GrantsManager: Unknown grant type to reverse: ${type} (grantId=${grantId})`);
        }

        return result;
    }

    /**
     * Reverse characteristic grant.
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: applied state is subclass-defined; narrowed inline below per characteristic-grant.ts
    static async _reverseCharacteristicGrant(actor: WH40KBaseActor, applied: Record<string, GrantAppliedEntry>, result: GrantReverseResult): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update payload
        const updates: Record<string, unknown> = {};

        for (const [key, raw] of Object.entries(applied)) {
            const state = raw as { previousValue?: number; newValue?: number; appliedValue?: number };
            if (state.previousValue !== undefined) {
                updates[`system.characteristics.${key}.advance`] = state.previousValue;
                result.notifications.push(`Reversed ${key}: ${state.newValue ?? 0} → ${state.previousValue}`);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: applied state is subclass-defined; narrowed inline below per skill-grant.ts
    static async _reverseSkillGrant(actor: WH40KBaseActor, applied: Record<string, GrantAppliedEntry>, result: GrantReverseResult): Promise<void> {
        const idsToDelete: string[] = [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry updateEmbeddedDocuments payload
        const itemsToUpdate: Record<string, unknown>[] = [];

        for (const [key, raw] of Object.entries(applied)) {
            const state = raw as { created?: boolean; upgraded?: boolean; itemId?: string; previousLevel?: string };
            if (state.created === true && state.itemId !== undefined) {
                // Delete created skill
                idsToDelete.push(state.itemId);
                result.notifications.push(`Removed skill: ${key}`);
            } else if (state.upgraded === true && state.itemId !== undefined && state.previousLevel !== undefined) {
                // Revert upgrade
                const updates = this._getSkillLevelUpdates(state.previousLevel);
                itemsToUpdate.push({ _id: state.itemId, ...updates });
                result.notifications.push(`Reverted skill ${key} to ${state.previousLevel}`);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: item-grant applied map values are item ids (strings); narrowed inline
    static async _reverseItemGrant(actor: WH40KBaseActor, applied: Record<string, GrantAppliedEntry>, result: GrantReverseResult): Promise<void> {
        const idsToDelete: string[] = [];

        for (const raw of Object.values(applied)) {
            if (typeof raw !== 'string') continue;
            if (actor.items.has(raw)) {
                const item = actor.items.get(raw);
                idsToDelete.push(raw);
                result.notifications.push(`Removed: ${item?.name ?? raw}`);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: applied state is subclass-defined; narrowed inline per resource-grant.ts
    static async _reverseResourceGrant(actor: WH40KBaseActor, applied: Record<string, GrantAppliedEntry>, result: GrantReverseResult): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update payload
        const updates: Record<string, unknown> = {};

        const resourcePaths: Partial<Record<string, { value: string; max?: string }>> = {
            wounds: { value: 'system.wounds.value', max: 'system.wounds.max' },
            fate: { value: 'system.fatePoints.value', max: 'system.fatePoints.max' },
            corruption: { value: 'system.corruption.value' },
            insanity: { value: 'system.insanity.value' },
        };

        for (const [resourceType, raw] of Object.entries(applied)) {
            const paths = resourcePaths[resourceType];
            if (paths === undefined) continue;
            const state = raw as { previousValue?: number; previousMax?: number };

            if (state.previousValue !== undefined) {
                updates[paths.value] = state.previousValue;
            }
            if (state.previousMax !== undefined && paths.max !== undefined) {
                updates[paths.max] = state.previousMax;
            }

            result.notifications.push(`Reversed ${resourceType}`);
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
            // falls through
            case 'plus10':
                updates['system.plus10'] = true;
            // falls through
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
    static _extractGrants(item: WH40KItem): GrantConfig[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: grantsV2 array is an opaque payload from item.system until createGrant() parses each entry
        const system = item.system as { grantsV2?: GrantConfig[] };
        if (Array.isArray(system.grantsV2)) {
            return system.grantsV2;
        }
        return [];
    }

    /**
     * Process nested grants from granted items.
     * @private
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: item-grant applied values are item ids; narrowed inline (typeof === 'string')
    static async _processNestedGrants(actor: WH40KBaseActor, appliedItems: Record<string, GrantAppliedEntry>, options: ApplyItemGrantsOptions): Promise<void> {
        for (const raw of Object.values(appliedItems)) {
            if (typeof raw !== 'string') continue;
            const item = actor.items.get(raw);
            if (!item) continue;

            // Check if the granted item has its own grants
            const grants = this._extractGrants(item);
            if (grants.length > 0) {
                game.wh40k.log(`GrantsManager: Processing nested grants from ${item.name}`);
                // eslint-disable-next-line no-await-in-loop -- nested items must process sequentially in source order
                await this.applyItemGrants(item, actor, options);
            }
        }
    }
}

// Export for convenience
export default GrantsManager;
