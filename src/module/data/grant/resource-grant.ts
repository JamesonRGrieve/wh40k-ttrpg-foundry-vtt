import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { resolveCharacteristicBonusRefs } from '../shared/characteristic-formula.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantApplyOptions, type GrantRestoreData, type GrantSummary } from './base-grant.ts';
import {
    GRANT_RESOURCES,
    isGrantResource,
    RESOURCE_PATHS,
    resourceApplyUpdates,
    type ResourceAppliedState,
    resourceRestoreUpdates,
    resourceReverseUpdates,
} from './resource-paths.ts';

/**
 * A single resource configuration within a resource grant.
 */
interface ResourceConfig {
    type: string;
    formula: string;
    optional: boolean;
    additive: boolean;
}

/**
 * Data shape returned by reverse() for resource grants.
 */
interface ResourceRestoreData {
    resources: Record<string, ResourceAppliedState>;
}

/** Reads a resource's current number off the actor (0 when unset). */
function actorReader(actor: WH40KBaseActor): (path: string) => number {
    return (path) => Number(foundry.utils.getProperty(actor, path)) || 0;
}

/**
 * Grant that provides resource bonuses to an actor.
 * Handles wounds, fate, corruption, insanity, etc.
 * Supports both flat values and dice formulas.
 *
 * @extends BaseGrantData
 */
export default class ResourceGrantData extends BaseGrantData {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static override TYPE = 'resource';
    static override ICON = 'icons/svg/aura.svg';

    /** Property declarations */
    declare resources: ResourceConfig[];
    declare applied: Record<string, ResourceAppliedState>;

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Resources to grant
            resources: new fields.ArrayField(
                new fields.SchemaField({
                    // Resource type (wounds, fate, corruption, insanity)
                    type: new fields.StringField({
                        required: true,
                        choices: [...GRANT_RESOURCES],
                    }),
                    // Formula or flat value (e.g., "1d5+2", "5", "2xTB")
                    formula: new fields.StringField({ required: true }),
                    // Is this optional?
                    optional: new fields.BooleanField({ initial: false }),
                    // When true (default), the rolled value is added to current max/value.
                    // When false (origin path wounds/fate/core stats), the rolled value
                    // replaces the current max/value so re-applying an origin doesn't
                    // accumulate stacking bonuses.
                    additive: new fields.BooleanField({ initial: true }),
                }),
                { required: true, initial: [] },
            ),

            // Applied state - tracks what was granted
            // Format: { "resourceType": { formula, rolledValue, previousValue } }
            applied: new fields.ObjectField({ required: true, initial: {} }),
        };
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: GrantApplyOptions, result: GrantApplicationResult): Promise<void> {
        const updates: Record<string, number> = {};
        const read = actorReader(actor);
        const selectedResources = (data['selected'] as string[] | undefined) ?? this.resources.map((r) => r.type);
        const rolledValues = (data['rolledValues'] as Record<string, number> | undefined) ?? {};

        for (const resourceConfig of this.resources) {
            const { type, formula, optional: resOptional, additive } = resourceConfig;

            if (!isGrantResource(type)) {
                result.errors.push(`Invalid resource type: ${type}`);
                continue;
            }
            if (!selectedResources.includes(type)) {
                if (!resOptional && !this.optional) result.errors.push(`Required resource ${type} not selected`);
                continue;
            }

            const { label, valuePath } = RESOURCE_PATHS[type];
            // NPCs carry no Corruption / Insanity: never write a field the actor's schema lacks.
            if (foundry.utils.getProperty(actor, valuePath) === undefined) {
                result.errors.push(`Actor has no ${type} to grant`);
                continue;
            }

            // eslint-disable-next-line no-await-in-loop -- formulas may reference actor state mutated by prior iterations
            const value = rolledValues[type] ?? (await this._evaluateFormula(formula, actor));
            if (value === 0) continue;

            const application = resourceApplyUpdates(type, { formula, value, additive }, read);
            Object.assign(updates, application.updates);
            result.applied[type] = application.state;

            const prefix = additive ? (value > 0 ? '+' : '') : '=';
            result.notifications.push(`${game.i18n.localize(label)} ${prefix}${value}`);
        }

        await this._applyUpdates(actor, updates, options);
    }

    /** @inheritDoc */
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, ResourceAppliedState>): Promise<ResourceRestoreData> {
        const read = actorReader(actor);

        // The shared merge/apply/guard tail lives in BaseGrantData._reverseWithDeltaMap (#345);
        // the per-resource reversal is resource-paths.ts's, shared with GrantsManager.
        const restores = await this._reverseWithDeltaMap(actor, appliedState, (type, state) => {
            if (!isGrantResource(type)) return null;
            return { deltas: resourceReverseUpdates(type, state, read), restore: { type, state } };
        });

        const restoreData: ResourceRestoreData = { resources: {} };
        for (const { type, state } of restores) restoreData.resources[type] = state;
        return restoreData;
    }

    /** @inheritDoc */
    override async restore(actor: WH40KBaseActor, restoreData: GrantRestoreData & ResourceRestoreData): Promise<GrantApplicationResult> {
        const result = this._initResult();
        const updates: Record<string, number> = {};
        const read = actorReader(actor);

        for (const [type, state] of Object.entries(restoreData.resources)) {
            if (!isGrantResource(type)) continue;
            Object.assign(updates, resourceRestoreUpdates(type, state, read));
            result.applied[type] = state;
        }

        await this._applyUpdates(actor, updates, {});
        return result;
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: payload feeds into apply() data
    override getAutomaticValue(): Record<string, unknown> | false {
        // Resources with formulas typically need user confirmation
        // Only auto-apply if all are flat values
        if (this.optional) return false;

        for (const resource of this.resources) {
            if (resource.optional) return false;
            // Check if formula contains dice or variables
            if (/[dD]|TB|WP|AG/i.test(resource.formula)) return false;
        }

        return { selected: this.resources.map((r) => r.type) };
    }

    /** @inheritDoc */
    override async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof ResourceGrantData;
        const summary = await super.getSummary();
        summary.icon = ctor.ICON;

        for (const resourceConfig of this.resources) {
            const label = isGrantResource(resourceConfig.type) ? game.i18n.localize(RESOURCE_PATHS[resourceConfig.type].label) : resourceConfig.type;

            summary.details.push({
                label: label,
                value: resourceConfig.formula,
                optional: resourceConfig.optional,
            });
        }

        return summary;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Evaluate a resource formula.
     * @param {string} formula - The formula to evaluate
     * @param {WH40KActor} actor - The actor for context
     * @returns {Promise<number>}
     * @private
     */
    async _evaluateFormula(formula: string, actor: WH40KBaseActor): Promise<number> {
        if (!formula) return 0;

        // Trim and normalize
        const normalizedFormula = String(formula).trim();
        if (!normalizedFormula) return 0;

        // Handle flat numbers
        const flat = parseInt(normalizedFormula, 10);
        if (!Number.isNaN(flat) && String(flat) === normalizedFormula) {
            return flat;
        }

        // Handle lookup table format: "(1-4|=2),(5-7|=3),(8-10|=4)"
        // This is a d10 roll table - roll and lookup the result
        // Match more robustly - look for pattern like (N-M|=X)
        if (/\(\d+-\d+\|=\d+\)/.test(normalizedFormula)) {
            return this._evaluateLookupTable(normalizedFormula);
        }

        // Replace characteristic-bonus references (TB, SB, …) with current bonuses.
        const characteristics = (actor.system as { characteristics?: Record<string, { bonus?: number }> }).characteristics;
        const processedFormula = resolveCharacteristicBonusRefs(normalizedFormula, (charKey) => characteristics?.[charKey]?.bonus ?? 0);

        // Evaluate dice formula
        try {
            const roll = await new Roll(processedFormula).evaluate();
            return roll.total;
        } catch (err) {
            console.error(`ResourceGrantData: Failed to evaluate formula "${normalizedFormula}" (processed: "${processedFormula}"):`, err);
            return 0;
        }
    }

    /**
     * Evaluate a lookup table formula like "(1-4|=2),(5-7|=3),(8-10|=4)".
     * Rolls 1d10 and returns the value for the matching range.
     * @param {string} formula - Lookup table formula
     * @returns {Promise<number>}
     * @private
     */
    async _evaluateLookupTable(formula: string): Promise<number> {
        // Parse entries: "(1-4|=2),(5-7|=3),(8-10|=4)"
        const entries: Array<{ min: number; max: number; value: number }> = [];
        const entryPattern = /\((\d+)-(\d+)\|=(\d+)\)/g;
        let match: RegExpExecArray | null = entryPattern.exec(formula);

        while (match !== null) {
            const [, minStr = '0', maxStr = '0', valStr = '0'] = match;
            entries.push({
                min: parseInt(minStr, 10),
                max: parseInt(maxStr, 10),
                value: parseInt(valStr, 10),
            });
            match = entryPattern.exec(formula);
        }

        if (entries.length === 0) {
            console.warn(`ResourceGrantData: Could not parse lookup table: ${formula}`);
            return 0;
        }

        // Roll 1d10
        const roll = await new Roll('1d10').evaluate();
        const rolled = roll.total;

        // Find matching entry
        for (const entry of entries) {
            if (rolled >= entry.min && rolled <= entry.max) {
                game.wh40k.log(`ResourceGrantData: Rolled ${rolled} on lookup table, result: ${entry.value}`);
                return entry.value;
            }
        }

        // No match - return first entry as fallback
        console.warn(`ResourceGrantData: Roll ${rolled} didn't match any range in: ${formula}`);
        return entries[0]?.value ?? 0;
    }
}
