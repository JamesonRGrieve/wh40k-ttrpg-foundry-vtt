import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantRestoreData, type GrantSummary } from './base-grant.ts';
import CharacteristicGrantData from './characteristic-grant.ts';
import ItemGrantData from './item-grant.ts';
import ResourceGrantData from './resource-grant.ts';
import SkillGrantData from './skill-grant.ts';

/**
 * A single selectable option within a choice grant.
 */
interface ChoiceOption {
    label: string;
    description: string;
    grants: Array<Record<string, unknown>>;
}

/**
 * Extended summary shape for ChoiceGrantData.
 */
interface ChoiceGrantSummary extends GrantSummary {
    choiceCount: number;
    options: Array<{
        label: string;
        description: string;
        grants: GrantSummary[];
    }>;
}

/**
 * Grant that presents choices to the player.
 * Can contain sub-grants of any type.
 *
 * @extends BaseGrantData
 */
export default class ChoiceGrantData extends BaseGrantData {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static override TYPE = 'choice';
    static override ICON = 'icons/svg/clockwork.svg';

    /**
     * Registry of grant types that can be used in choices.
     * @type {object}
     */
    static GRANT_TYPES = {
        item: ItemGrantData,
        skill: SkillGrantData,
        characteristic: CharacteristicGrantData,
        resource: ResourceGrantData,
    };

    /** Property declarations */
    declare count: number;
    declare options: ChoiceOption[];
    declare allowDuplicates: boolean;
    declare applied: Record<string, unknown>;

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Number of choices the player must make
            count: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),

            // Choice options - each option can grant multiple things
            options: new fields.ArrayField(
                new fields.SchemaField({
                    // Display label for this option
                    label: new fields.StringField({ required: true }),
                    // Description/hint
                    description: new fields.StringField({ required: false, blank: true }),
                    // Grants provided by this option (array of grant configs)
                    grants: new fields.ArrayField(new fields.ObjectField({ required: true }), { required: true, initial: [] }),
                }),
                { required: true, initial: [] },
            ),

            // Whether options can be selected multiple times
            allowDuplicates: new fields.BooleanField({ initial: false }),

            // Applied state - tracks selected options and their applied grants
            // Format: { selectedOptions: ["option1", "option2"], grantResults: {...} }
            applied: new fields.ObjectField({ required: true, initial: {} }),
        };
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override _initResult(): GrantApplicationResult {
        return { success: true, applied: { selectedOptions: [], grantResults: {} }, notifications: [], errors: [] };
    }

    /** @inheritDoc */
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: Record<string, unknown>, result: GrantApplicationResult): Promise<void> {
        const choiceOptions = this.options ?? [];
        if (choiceOptions.length === 0) {
            result.notifications.push('Choice grant has no options to apply');
            return;
        }

        const selectedOptions = (data['selected'] as string[]) ?? [];

        if (selectedOptions.length < this.count && !this.optional) {
            result.errors.push(`Must select ${this.count} options, only ${selectedOptions.length} selected`);
            return;
        }

        if (!this.allowDuplicates) {
            const unique = new Set(selectedOptions);
            if (unique.size !== selectedOptions.length) {
                result.errors.push('Duplicate selections not allowed');
                return;
            }
        }

        const appliedResult = result.applied as { selectedOptions: string[]; grantResults: Record<string, unknown> };

        for (const optionLabel of selectedOptions) {
            const option = choiceOptions.find((o) => o.label === optionLabel);
            if (!option) {
                result.errors.push(`Unknown option: ${optionLabel}`);
                continue;
            }

            appliedResult.selectedOptions.push(optionLabel);
            result.notifications.push(`Selected: ${optionLabel}`);

            const grants = option.grants ?? [];
            for (let i = 0; i < grants.length; i++) {
                const grantConfig = grants[i];

                const grantResult = await this._applySubGrant(actor, grantConfig, data, options);
                appliedResult.grantResults[`${optionLabel}:${i}`] = {
                    type: grantConfig['type'],
                    applied: grantResult.applied,
                };
                result.notifications.push(...grantResult.notifications);
                result.errors.push(...grantResult.errors);
            }
        }
    }

    /** @inheritDoc */
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, unknown>): Promise<unknown> {
        const ctor = this.constructor as typeof ChoiceGrantData;
        const restoreData: { selectedOptions: string[]; grantResults: Record<string, unknown> } = {
            selectedOptions: (appliedState['selectedOptions'] as string[]) ?? [],
            grantResults: {},
        };

        // Reverse each applied grant in reverse order
        const grantResults = (appliedState['grantResults'] ?? {}) as Record<string, Record<string, unknown>>;
        for (const [grantKey, grantEntry] of Object.entries(grantResults)) {
            const [optionLabel, indexStr] = grantKey.split(':');
            const index = parseInt(indexStr);

            const option = this.options.find((o) => o.label === optionLabel);
            if (!option?.grants[index]) continue;

            const grantConfig = option.grants[index];
            const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
            const GrantClass = ctor.GRANT_TYPES[grantType];
            if (!GrantClass) continue;

            const grantApplied = grantEntry?.['applied'] as Record<string, unknown>;

            const grant: BaseGrantData = new GrantClass(grantConfig);
            const reverseData = await grant.reverse(actor, grantApplied);
            restoreData.grantResults[grantKey] = reverseData;
        }

        return restoreData;
    }

    /** @inheritDoc */
    override getAutomaticValue(): false {
        // Choices always require user interaction
        return false;
    }

    /** @inheritDoc */
    override async getSummary(): Promise<ChoiceGrantSummary> {
        const ctor = this.constructor as typeof ChoiceGrantData;
        const baseSummary = await super.getSummary();
        const summary: ChoiceGrantSummary = {
            ...baseSummary,
            icon: ctor.ICON,
            choiceCount: this.count,
            options: [],
        };

        for (const option of this.options) {
            const optionSummary: { label: string; description: string; grants: GrantSummary[] } = {
                label: option.label,
                description: option.description,
                grants: [],
            };

            for (const grantConfig of option.grants) {
                const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
                const GrantClass = ctor.GRANT_TYPES[grantType];
                if (GrantClass) {
                    const grant = new GrantClass(grantConfig);
                    const grantSummary = await grant.getSummary();
                    optionSummary.grants.push(grantSummary);
                }
            }

            summary.options.push(optionSummary);
        }

        return summary;
    }

    /** @inheritDoc */
    override validateGrant(): string[] {
        const ctor = this.constructor as typeof ChoiceGrantData;
        const errors = super.validateGrant();

        // Handle missing/undefined options gracefully
        const options = this.options ?? [];

        if (options.length === 0) {
            errors.push('Choice grant has no options');
        }

        if (this.count > options.length && !this.allowDuplicates) {
            errors.push(`Cannot select ${this.count} from ${options.length} options without duplicates`);
        }

        // Validate sub-grants
        for (const option of options) {
            const grants = option.grants ?? [];
            for (const grantConfig of grants) {
                const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
                const GrantClass = ctor.GRANT_TYPES[grantType];
                if (!GrantClass) {
                    errors.push(`Unknown grant type "${grantConfig['type'] as string}" in option "${option.label}"`);
                }
            }
        }

        return errors;
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Apply a sub-grant.
     * @param {WH40KActor} actor
     * @param {object} grantConfig
     * @param {object} data
     * @param {object} options
     * @returns {Promise<GrantApplicationResult>}
     * @private
     */
    _applySubGrant(
        actor: WH40KBaseActor,
        grantConfig: Record<string, unknown>,
        data: GrantRestoreData,
        options: Record<string, unknown>,
    ): Promise<GrantApplicationResult> | GrantApplicationResult {
        const ctor = this.constructor as typeof ChoiceGrantData;
        const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
        const GrantClass = ctor.GRANT_TYPES[grantType];
        if (!GrantClass) {
            return {
                success: false,
                applied: {},
                notifications: [],
                errors: [`Unknown grant type: ${grantConfig['type'] as string}`],
            };
        }

        // Ensure grant config has required fields with defaults
        const fullConfig = {
            _id: (grantConfig['_id'] as string) || foundry.utils.randomID(),
            type: grantConfig['type'],
            optional: (grantConfig['optional'] as boolean) ?? false,
            ...grantConfig,
        };

        const grant = new GrantClass(fullConfig);

        // Pass through any sub-grant specific data
        const subData = (data as Record<string, unknown>)['subGrants'] as Record<string, GrantRestoreData> | undefined;
        const subGrantData = subData?.[grantConfig['_id'] as string] ?? {};

        return grant.apply(actor, subGrantData, options);
    }
}
