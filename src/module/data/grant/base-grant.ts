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
export default class BaseGrantData extends (foundry.abstract.DataModel as any) {
    [key: string]: any;
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
    static get typeLabel() {
        return `WH40K.Grant.Type.${this.TYPE}`;
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema() {
        const fields = (foundry.data as any).fields;
        return {
            // Unique identifier for this grant within its parent
            _id: new fields.DocumentIdField({ initial: () => foundry.utils.randomID() }),

            // Grant type identifier
            type: new fields.StringField({
                required: true,
                initial: this.TYPE,
                validate: (v) => v === this.TYPE,
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
    get item() {
        return this.parent?.parent ?? null;
    }

    /**
     * The actor this grant is being applied to (if any).
     * @type {WH40KActor|null}
     */
    get actor() {
        return this.item?.actor ?? null;
    }

    /**
     * Display label for this grant.
     * @type {string}
     */
    get displayLabel() {
        return this.label || game.i18n.localize((this.constructor as any).typeLabel);
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /**
     * Initialise a blank result object. Override to customise the `applied` shape.
     * @returns {GrantApplicationResult}
     */
    _initResult(): any {
        return { success: true, applied: {}, notifications: [], errors: [] };
    }

    /**
     * Apply this grant to an actor.
     * Handles the result scaffolding, null-actor guard, and success calculation.
     * Subclasses implement {@link _applyGrant}.
     * @param {WH40KActor} actor
     * @param {object} [data={}]
     * @param {object} [options={}]
     * @param {boolean} [options.dryRun=false]
     * @returns {Promise<GrantApplicationResult>}
     */
    async apply(actor, data: any = {}, options: any = {}) {
        const result = this._initResult();
        if (!actor) {
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
     * @param {WH40KActor} actor
     * @param {object} data
     * @param {object} options
     * @param {GrantApplicationResult} result
     * @protected
     * @abstract
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async _applyGrant(actor, data, options, result): Promise<void> {
        throw new Error(`${this.constructor.name} must implement _applyGrant()`);
    }

    /**
     * Reverse/undo this grant from an actor.
     * @param {WH40KActor} actor - The actor to remove the grant from
     * @param {object} appliedState - The state from when grant was applied
     * @returns {Promise<object>} Data needed to restore the grant
     * @abstract
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async reverse(actor, appliedState) {
        throw new Error(`${this.constructor.name} must implement reverse()`);
    }

    /**
     * Restore a previously reversed grant.
     * @param {WH40KActor} actor - The actor to restore the grant to
     * @param {object} restoreData - Data returned from reverse()
     * @returns {Promise<GrantApplicationResult>}
     */
    async restore(actor, restoreData) {
        return this.apply(actor, restoreData, { restore: true });
    }

    /**
     * Conditionally apply an actor update, skipping in dry-run mode.
     * @param {WH40KActor} actor
     * @param {object} updates
     * @param {object} options
     * @protected
     */
    async _applyUpdates(actor, updates: Record<string, any>, options: any): Promise<void> {
        if (!options.dryRun && Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
    }

    /**
     * Check if this grant can be automatically applied without user interaction.
     * @returns {object|false} Data to auto-apply, or false if user input needed
     */
    getAutomaticValue() {
        if (this.optional) return false;
        return {};
    }

    /**
     * Get a summary of what this grant provides.
     * @returns {Promise<GrantSummary>}
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async getSummary() {
        return {
            type: (this.constructor as any).TYPE,
            label: this.displayLabel,
            icon: (this.constructor as any).ICON,
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
    validateGrant() {
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
    _createGrantFlags(sourceUuid) {
        return {
            'wh40k-rpg': {
                sourceId: sourceUuid,
                grantId: this._id,
                grantType: (this.constructor as any).TYPE,
                grantedBy: this.item?.name,
                grantedById: this.item?.id,
                autoGranted: true,
            },
        };
    }

    /**
     * Fetch an item from UUID.
     * @param {string} uuid - The item UUID
     * @returns {Promise<Item|null>}
     * @protected
     */
    async _fetchItem(uuid) {
        if (!uuid) return null;
        try {
            return await fromUuid(uuid);
        } catch (err) {
            console.error(`BaseGrantData: Failed to fetch item ${uuid}:`, err);
            return null;
        }
    }
}

/* -------------------------------------------- */
/*  Type Definitions                            */
/* -------------------------------------------- */

/**
 * @typedef {object} GrantApplicationResult
 * @property {boolean} success - Whether application succeeded
 * @property {object} applied - State tracking what was applied
 * @property {string[]} notifications - Messages to show user
 * @property {string[]} errors - Error messages if any
 */

/**
 * @typedef {object} GrantSummary
 * @property {string} type - Grant type identifier
 * @property {string} label - Display label
 * @property {string} icon - Icon path
 * @property {Array<{label: string, value: string}>} details - Detail lines
 */
