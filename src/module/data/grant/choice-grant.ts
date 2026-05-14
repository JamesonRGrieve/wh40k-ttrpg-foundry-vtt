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
    // eslint-disable-next-line no-restricted-syntax -- boundary: grants are heterogeneous grant config objects stored in Foundry ObjectField; no fixed schema per grant type
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: applied tracks mixed grant result objects in a Foundry ObjectField; no fixed schema
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: options is a pass-through Foundry grant options bag; no fixed schema
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: Record<string, unknown>, result: GrantApplicationResult): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: this.options may be absent on legacy serialized grant data; defensive fallback required
        const choiceOptions = this.options ?? [];
        if (choiceOptions.length === 0) {
            result.notifications.push('Choice grant has no options to apply');
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: data['selected'] is an untyped GrantRestoreData field; may be absent on first apply
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

        // eslint-disable-next-line no-restricted-syntax -- boundary: result.applied is a Foundry grant result bag; cast narrows to the known structure for this grant type
        const appliedResult = result.applied as { selectedOptions: string[]; grantResults: Record<string, unknown> };

        for (const optionLabel of selectedOptions) {
            const option = choiceOptions.find((o) => o.label === optionLabel);
            if (!option) {
                result.errors.push(`Unknown option: ${optionLabel}`);
                continue;
            }

            appliedResult.selectedOptions.push(optionLabel);
            result.notifications.push(`Selected: ${optionLabel}`);

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- option.grants may be absent on legacy/migrated data despite the interface declaration
            const grants = option.grants ?? [];
            for (const [i, grantConfig] of grants.entries()) {
                // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: appliedState is an opaque Foundry grant result bag; return Promise<unknown> matches base class signature
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, unknown>): Promise<unknown> {
        const ctor = this.constructor as typeof ChoiceGrantData;
        // eslint-disable-next-line no-restricted-syntax -- boundary: restoreData contains mixed grant result types; Record<string, unknown> is the required storage shape
        const restoreData: { selectedOptions: string[]; grantResults: Record<string, unknown> } = {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- appliedState['selectedOptions'] may be absent on legacy persisted data
            selectedOptions: (appliedState['selectedOptions'] as string[]) ?? [],
            grantResults: {},
        };

        // Reverse each applied grant in reverse order
        // eslint-disable-next-line no-restricted-syntax -- boundary: appliedState['grantResults'] is untyped Foundry grant result storage; cast to nested Record is required
        const grantResults = (appliedState['grantResults'] ?? {}) as Record<string, Record<string, unknown>>;
        for (const [grantKey, grantEntry] of Object.entries(grantResults)) {
            const [optionLabel, indexStr] = grantKey.split(':');
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- indexStr may be undefined if grantKey has unexpected format
            const index = parseInt(indexStr ?? '', 10);

            const option = this.options.find((o) => o.label === optionLabel);
            if (!option?.grants[index]) continue;

            const grantConfig = option.grants[index];
            const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
            const GrantClass = ctor.GRANT_TYPES[grantType];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- grantType may not match a registered GRANT_TYPES key on legacy/unknown grant types
            if (GrantClass === undefined) continue;

            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: grantEntry is untyped legacy grant result storage; cast to Record required for reverse() parameter
            const grantApplied = grantEntry?.['applied'] as Record<string, unknown>;

            const grant: BaseGrantData = new GrantClass(grantConfig);
            // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- grantType may not match a registered GRANT_TYPES key on unknown grant types
                if (GrantClass !== undefined) {
                    const grant = new GrantClass(grantConfig);
                    // eslint-disable-next-line no-await-in-loop -- sequential by design (see above)
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
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: this.options may be absent on legacy serialized grant data; defensive fallback required
        const options = this.options ?? [];

        if (options.length === 0) {
            errors.push('Choice grant has no options');
        }

        if (this.count > options.length && !this.allowDuplicates) {
            errors.push(`Cannot select ${this.count} from ${options.length} options without duplicates`);
        }

        // Validate sub-grants
        for (const option of options) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- option.grants may be absent on legacy/migrated data despite the interface declaration
            const grants = option.grants ?? [];
            for (const grantConfig of grants) {
                const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
                const GrantClass = ctor.GRANT_TYPES[grantType];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- grantType may not match a registered GRANT_TYPES key on unknown/legacy grant types
                if (GrantClass === undefined) {
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: grantConfig is a heterogeneous Foundry grant config object; type is discriminated at runtime via grantConfig['type']
        grantConfig: Record<string, unknown>,
        data: GrantRestoreData,
        // eslint-disable-next-line no-restricted-syntax -- boundary: options is a pass-through Foundry grant options bag; no fixed schema
        options: Record<string, unknown>,
    ): Promise<GrantApplicationResult> | GrantApplicationResult {
        const ctor = this.constructor as typeof ChoiceGrantData;
        const grantType = grantConfig['type'] as keyof typeof ctor.GRANT_TYPES;
        const GrantClass = ctor.GRANT_TYPES[grantType];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- grantType may not match a registered GRANT_TYPES key on unknown/legacy grant types
        if (GrantClass === undefined) {
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- grantConfig['optional'] may be absent on legacy grant configs; defensive fallback required
            optional: (grantConfig['optional'] as boolean) ?? false,
            ...grantConfig,
        };

        const grant = new GrantClass(fullConfig);

        // Pass through any sub-grant specific data
        // eslint-disable-next-line no-restricted-syntax -- boundary: GrantRestoreData is opaque; 'subGrants' is an extension field not declared in the type
        const subData = (data as Record<string, unknown>)['subGrants'] as Record<string, GrantRestoreData> | undefined;
        const subGrantData = subData?.[grantConfig['_id'] as string] ?? {};

        return grant.apply(actor, subGrantData, options);
    }
}
