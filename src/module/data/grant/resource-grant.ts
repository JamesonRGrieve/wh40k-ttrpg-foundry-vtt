import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantRestoreData, type GrantSummary } from './base-grant.ts';

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
 * State stored per resource type after application.
 */
interface ResourceAppliedState {
    formula: string;
    rolledValue: number;
    additive: boolean;
    previousValue: number;
    previousMax: number | null;
    newValue: number;
    newMax: number | null;
}

/**
 * Data shape returned by reverse() for resource grants.
 */
interface ResourceRestoreData {
    resources: Record<string, ResourceAppliedState>;
}

/**
 * Definition of a resource type and its actor paths.
 */
interface ResourceDefinition {
    label: string;
    valuePath: string;
    maxPath: string | null;
    affectsMax: boolean;
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

    /**
     * Valid resource types and their paths.
     * @type {object}
     */
    static RESOURCES: Record<string, ResourceDefinition> = {
        wounds: {
            label: 'WH40K.Resource.Wounds',
            valuePath: 'system.wounds.value',
            maxPath: 'system.wounds.max',
            affectsMax: true,
        },
        fate: {
            label: 'WH40K.Resource.Fate',
            valuePath: 'system.fate.value',
            maxPath: 'system.fate.max',
            affectsMax: true,
        },
        corruption: {
            label: 'WH40K.Resource.Corruption',
            valuePath: 'system.corruption.value',
            maxPath: null,
            affectsMax: false,
        },
        insanity: {
            label: 'WH40K.Resource.Insanity',
            valuePath: 'system.insanity.value',
            maxPath: null,
            affectsMax: false,
        },
    };

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
                        choices: Object.keys(ResourceGrantData.RESOURCES),
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
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: Record<string, unknown>, result: GrantApplicationResult): Promise<void> {
        const ctor = this.constructor as typeof ResourceGrantData;
        const updates: Record<string, unknown> = {};
        const selectedResources = (data.selected as string[] | undefined) ?? this.resources.map((r) => r.type);
        const rolledValues = (data.rolledValues as Record<string, number> | undefined) ?? {};

        for (const resourceConfig of this.resources) {
            const { type, formula, optional: resOptional, additive } = resourceConfig;

            if (!(type in ctor.RESOURCES)) {
                result.errors.push(`Invalid resource type: ${type}`);
                continue;
            }
            const resourceDef = ctor.RESOURCES[type];

            if (!selectedResources.includes(type)) {
                if (!resOptional && !this.optional) result.errors.push(`Required resource ${type} not selected`);
                continue;
            }

            const value = rolledValues[type] ?? (await this._evaluateFormula(formula, actor));
            if (value === 0) continue;

            const currentValue = Number(foundry.utils.getProperty(actor, resourceDef.valuePath)) || 0;
            let currentMax: number | null = null;
            if (resourceDef.affectsMax && resourceDef.maxPath !== null) {
                currentMax = Number(foundry.utils.getProperty(actor, resourceDef.maxPath)) || 0;
            }

            const isAdditive = additive;
            const newValue = isAdditive ? currentValue + value : value;
            const newMax = currentMax !== null ? (isAdditive ? currentMax + value : value) : null;

            updates[resourceDef.valuePath] = newValue;
            if (resourceDef.affectsMax && resourceDef.maxPath !== null) {
                updates[resourceDef.maxPath] = newMax;
            }

            result.applied[type] = {
                formula,
                rolledValue: value,
                additive: isAdditive,
                previousValue: currentValue,
                previousMax: currentMax,
                newValue,
                newMax,
            };

            const label = game.i18n.localize(resourceDef.label);
            const prefix = isAdditive ? (value > 0 ? '+' : '') : '=';
            result.notifications.push(`${label} ${prefix}${value}`);
        }

        await this._applyUpdates(actor, updates, options);
    }

    /** @inheritDoc */
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, unknown>): Promise<ResourceRestoreData> {
        const ctor = this.constructor as typeof ResourceGrantData;
        const restoreData: ResourceRestoreData = { resources: {} };
        const updates: Record<string, unknown> = {};

        for (const [type, state] of Object.entries(appliedState) as [string, ResourceAppliedState][]) {
            if (!(type in ctor.RESOURCES)) continue;
            const resourceDef = ctor.RESOURCES[type];

            if (!state.additive) {
                // Replace grants restore the captured previousValue/previousMax exactly.
                updates[resourceDef.valuePath] = state.previousValue;
                if (resourceDef.affectsMax && resourceDef.maxPath !== null && state.previousMax !== null) {
                    updates[resourceDef.maxPath] = state.previousMax;
                }
            } else {
                const currentValue = Number(foundry.utils.getProperty(actor, resourceDef.valuePath)) || 0;
                updates[resourceDef.valuePath] = currentValue - state.rolledValue;

                if (resourceDef.affectsMax && resourceDef.maxPath !== null) {
                    const currentMax = Number(foundry.utils.getProperty(actor, resourceDef.maxPath)) || 0;
                    updates[resourceDef.maxPath] = currentMax - state.rolledValue;
                }
            }

            restoreData.resources[type] = state;
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        return restoreData;
    }

    /** @inheritDoc */
    override async restore(actor: WH40KBaseActor, restoreData: ResourceRestoreData): Promise<GrantApplicationResult> {
        const ctor = this.constructor as typeof ResourceGrantData;
        const result = this._initResult();
        const updates: Record<string, unknown> = {};

        for (const [type, state] of Object.entries(restoreData.resources)) {
            if (!(type in ctor.RESOURCES)) continue;
            const resourceDef = ctor.RESOURCES[type];

            const currentValue = Number(foundry.utils.getProperty(actor, resourceDef.valuePath)) || 0;
            updates[resourceDef.valuePath] = currentValue + state.rolledValue;

            if (resourceDef.affectsMax && resourceDef.maxPath !== null) {
                const currentMax = Number(foundry.utils.getProperty(actor, resourceDef.maxPath)) || 0;
                updates[resourceDef.maxPath] = currentMax + state.rolledValue;
            }

            result.applied[type] = state;
        }

        await this._applyUpdates(actor, updates, {});
        return result;
    }

    /** @inheritDoc */
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
            const hasDef = resourceConfig.type in ctor.RESOURCES;
            const label = hasDef ? game.i18n.localize(ctor.RESOURCES[resourceConfig.type].label) : resourceConfig.type;

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
        const flat = parseInt(normalizedFormula);
        if (!isNaN(flat) && String(flat) === normalizedFormula) {
            return flat;
        }

        // Handle lookup table format: "(1-4|=2),(5-7|=3),(8-10|=4)"
        // This is a d10 roll table - roll and lookup the result
        // Match more robustly - look for pattern like (N-M|=X)
        if (/\(\d+-\d+\|=\d+\)/.test(normalizedFormula)) {
            return this._evaluateLookupTable(normalizedFormula);
        }

        // Replace characteristic references
        let processedFormula = normalizedFormula;

        // Replace TB, WPB, etc. with actual bonus values
        const charAbbreviations: Record<string, string> = {
            TB: 'toughness',
            SB: 'strength',
            AB: 'agility',
            WPB: 'willpower',
            FB: 'fellowship',
            IB: 'intelligence',
            PB: 'perception',
            WSB: 'weaponSkill',
            BSB: 'ballisticSkill',
        };

        for (const [abbr, charKey] of Object.entries(charAbbreviations)) {
            const regex = new RegExp(`(\\d*)x?${abbr}`, 'gi');
            processedFormula = processedFormula.replace(regex, (match, multiplier: string) => {
                const bonus = (actor.system as { characteristics?: Record<string, { bonus?: number }> }).characteristics?.[charKey]?.bonus ?? 0;
                const mult = parseInt(multiplier) || 1;
                return String(bonus * mult);
            });
        }

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
        let match;

        while ((match = entryPattern.exec(formula)) !== null) {
            entries.push({
                min: parseInt(match[1]),
                max: parseInt(match[2]),
                value: parseInt(match[3]),
            });
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
