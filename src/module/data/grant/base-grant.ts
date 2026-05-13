import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';

/** Per-grant `applied` map values are grant-specific; opaque at base level. */
// eslint-disable-next-line no-restricted-syntax -- boundary: each grant subclass defines its own applied shape
export type GrantAppliedEntry = unknown;

/** Options accepted by {@link BaseGrantData.apply}. */
export interface GrantApplyOptions {
    /** When true, skip persistence; only compute the would-be result. */
    dryRun?: boolean;
    /** When true, this is a restore from a previously reversed grant. */
    restore?: boolean;
    /** Recursion depth, used by GrantsManager to prevent infinite item-grant chains. */
    depth?: number;
}

/** Module-flag payload attached to granted items so reversal can find them. */
export interface GrantFlags {
    'wh40k-rpg': {
        sourceId: string;
        grantId: string;
        grantType: string;
        grantedBy: string | null | undefined;
        grantedById: string | null | undefined;
        autoGranted: boolean;
    };
}

/**
 * Result of applying a grant to an actor.
 */
export interface GrantApplicationResult {
    success: boolean;
    applied: Record<string, GrantAppliedEntry>;
    notifications: string[];
    errors: string[];
}

/**
 * Summary information for a grant type.
 */
export interface GrantSummary {
    type: string;
    label: string;
    icon: string;
    details: Array<{
        label: string;
        value: string | number;
        optional?: boolean;
    }>;
}

/**
 * Data needed to restore a grant.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: grant restore payload from item flags
export type GrantRestoreData = { uuid?: string } & Record<string, unknown>;

/**
 * Base DataModel for all grant types.
 * Grants represent things that can be given to an actor (items, skills, stats, etc).
 *
 * Following DND5E's Advancement pattern:
 * - Configuration: What CAN be granted (immutable, stored on source item)
 * - Value: What WAS granted (mutable, tracks applied state)
 *
 * @abstract
 */
export default class BaseGrantData extends foundry.abstract.DataModel<Record<string, foundry.data.fields.DataField.Any>, foundry.abstract.DataModel.Any> {
    declare _id: string;
    declare type: string;
    declare optional: boolean;
    declare label?: string;
    declare hint?: string;

    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    /**
     * Type identifier for this grant.
     * @type {string}
     */
    static TYPE = 'base';

    /**
     * Icon for this grant type.
     * @type {string}
     */
    static ICON = 'icons/svg/upgrade.svg';

    /**
     * Localization key for the grant type name.
     * @type {string}
     */
    static get typeLabel(): string {
        return `WH40K.Grant.Type.${this.TYPE}`;
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            // Unique identifier for this grant within its parent
            _id: new fields.DocumentIdField({ initial: () => foundry.utils.randomID() }),

            // Grant type identifier
            type: new fields.StringField({
                required: true,
                initial: () => this.TYPE,
                validate: (v: string) => v === this.TYPE,
                validationError: `Type must be "${this.TYPE}"`,
            }),

            // Optional flag - can player skip this grant?
            optional: new fields.BooleanField({ required: true, initial: false }),

            // Display label override
            label: new fields.StringField({ required: false, blank: true }),

            // Hint text for the player
            hint: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * The parent item containing this grant.
     * @type {WH40KItem|null}
     */
    get item(): WH40KItem | null {
        const parent = this.parent as { parent?: WH40KItem } | null;
        return parent?.parent ?? null;
    }

    /**
     * The actor this grant is being applied to (if any).
     * @type {WH40KBaseActor|null}
     */
    get actor(): WH40KBaseActor | null {
        return this.item?.actor ?? null;
    }

    /**
     * Display label for this grant.
     * @type {string}
     */
    get displayLabel(): string {
        const ctor = this.constructor as typeof BaseGrantData;
        if (this.label !== undefined && this.label !== '') return this.label;
        return game.i18n.localize(ctor.typeLabel);
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /**
     * Initialise a blank result object. Override to customise the `applied` shape.
     * @returns {GrantApplicationResult}
     */
    _initResult(): GrantApplicationResult {
        return { success: true, applied: {}, notifications: [], errors: [] };
    }

    /**
     * Apply this grant to an actor.
     * Handles the result scaffolding, null-actor guard, and success calculation.
     * Subclasses implement {@link _applyGrant}.
     * @param {WH40KBaseActor} actor
     * @param {GrantRestoreData} [data]
     * @param {Record<string, unknown>} [options={}]
     * @param {boolean} [options.dryRun=false]
     * @returns {Promise<GrantApplicationResult>}
     */
    async apply(actor: WH40KBaseActor | null, data: GrantRestoreData = {}, options: GrantApplyOptions = {}): Promise<GrantApplicationResult> {
        const result = this._initResult();
        if (actor === null) {
            result.success = false;
            result.errors.push('No actor provided');
            return result;
        }
        await this._applyGrant(actor, data, options, result);
        result.success = result.errors.length === 0;
        return result;
    }

    /**
     * Type-specific grant logic. Mutates `result` in place.
     * @param {WH40KBaseActor} actor
     * @param {GrantRestoreData} data
     * @param {Record<string, unknown>} options
     * @param {GrantApplicationResult} result
     * @protected
     * @abstract
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- abstract; subclasses await
    async _applyGrant(_actor: WH40KBaseActor, _data: GrantRestoreData, _options: GrantApplyOptions, _result: GrantApplicationResult): Promise<void> {
        throw new Error(`${this.constructor.name} must implement _applyGrant()`);
    }

    /**
     * Reverse/undo this grant from an actor.
     * @param {WH40KBaseActor} actor - The actor to remove the grant from
     * @param {object} appliedState - The state from when grant was applied
     * @returns {Promise<object>} Data needed to restore the grant
     * @abstract
     */
    /* eslint-disable-next-line @typescript-eslint/require-await, no-restricted-syntax -- abstract; subclass-specific reverse return */
    async reverse(_actor: WH40KBaseActor, _appliedState: Record<string, GrantAppliedEntry>): Promise<unknown> {
        throw new Error(`${this.constructor.name} must implement reverse()`);
    }

    /**
     * Restore a previously reversed grant.
     * @param actor - The actor to restore the grant to
     * @param restoreData - Data returned from reverse()
     */
    async restore(actor: WH40KBaseActor, restoreData: GrantRestoreData): Promise<GrantApplicationResult> {
        return this.apply(actor, restoreData, { restore: true });
    }

    /**
     * Conditionally apply an actor update, skipping in dry-run mode.
     * @param {WH40KBaseActor} actor
     * @param {object} updates
     * @param {object} options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document.update payload
    async _applyUpdates(actor: WH40KBaseActor, updates: Record<string, unknown>, options: GrantApplyOptions): Promise<void> {
        if (options.dryRun !== true && Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
    }

    /**
     * Check if this grant can be automatically applied without user interaction.
     * @returns {object|false} Data to auto-apply, or false if user input needed
     */
    getAutomaticValue(): GrantRestoreData | false {
        if (this.optional) return false;
        return {};
    }

    /**
     * Get a summary of what this grant provides.
     * @returns {Promise<GrantSummary>}
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof BaseGrantData;
        return {
            type: ctor.TYPE,
            label: this.displayLabel,
            icon: ctor.ICON,
            details: [],
        };
    }

    /* -------------------------------------------- */
    /*  Validation                                  */
    /* -------------------------------------------- */

    /**
     * Validate the grant configuration.
     * Note: Named validateGrant to avoid collision with Foundry's DataModel.validate()
     * @returns {string[]} Array of validation error messages
     */
    validateGrant(): string[] {
        return [];
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Create flags object for granted items.
     * @param {string} sourceUuid - UUID of the source item
     * @returns {object}
     * @protected
     */
    _createGrantFlags(sourceUuid: string): GrantFlags {
        const ctor = this.constructor as typeof BaseGrantData;
        return {
            'wh40k-rpg': {
                sourceId: sourceUuid,
                grantId: this._id,
                grantType: ctor.TYPE,
                grantedBy: this.item?.name,
                grantedById: this.item?.id,
                autoGranted: true,
            },
        };
    }

    /**
     * Fetch an item from UUID.
     * @param {string} uuid - The item UUID
     * @returns {Promise<WH40KItem|null>}
     * @protected
     */
    async _fetchItem(uuid: string): Promise<WH40KItem | null> {
        if (uuid === '') return null;
        try {
            const doc = await fromUuid(uuid);
            return (doc as WH40KItem | null | undefined) ?? null;
        } catch (err) {
            console.error(`BaseGrantData: Failed to fetch item ${uuid}:`, err);
            return null;
        }
    }
}
