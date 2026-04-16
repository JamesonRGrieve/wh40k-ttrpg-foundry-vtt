import BaseGrantData from './base-grant.ts';
import CharacteristicGrantData from './characteristic-grant.ts';
import ItemGrantData from './item-grant.ts';
import ResourceGrantData from './resource-grant.ts';
import SkillGrantData from './skill-grant.ts';

/**
 * Grant that presents choices to the player.
 * Can contain sub-grants of any type.
 *
 * @extends BaseGrantData
 */
export default class ChoiceGrantData extends (BaseGrantData as any) {
    [key: string]: any;
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static TYPE = 'choice';
    static ICON = 'icons/svg/clockwork.svg';

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

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = (foundry.data as any).fields;
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
    _initResult(): any {
        return { success: true, applied: { selectedOptions: [], grantResults: {} }, notifications: [], errors: [] };
    }

    /** @inheritDoc */
    async _applyGrant(actor: any, data: any, options: Record<string, any>, result: any): Promise<void> {
        const choiceOptions = this.options ?? [];
        if (choiceOptions.length === 0) {
            result.notifications.push('Choice grant has no options to apply');
            return;
        }

        const selectedOptions = data.selected ?? [];

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

        for (const optionLabel of selectedOptions) {
            let option = choiceOptions.find((o) => o.label === optionLabel);
            let extractedSpec: string | null = null;

            // Composite match: "Weapon Training (Solid Projectile)" → base "Weapon Training"
            if (!option) {
                const parenIdx = optionLabel.indexOf(' (');
                if (parenIdx > 0) {
                    const baseName = optionLabel.substring(0, parenIdx);
                    extractedSpec = optionLabel.substring(parenIdx + 2, optionLabel.length - 1);
                    option = choiceOptions.find((o) => o.label === baseName);
                }
            }
            if (!option) {
                result.errors.push(`Unknown option: ${optionLabel}`);
                continue;
            }

            result.applied.selectedOptions.push(optionLabel);
            result.notifications.push(`Selected: ${optionLabel}`);

            const grants = option.grants ?? [];
            for (let i = 0; i < grants.length; i++) {
                const grantConfig = grants[i];

                // Propagate extracted specialization to item grants
                if (extractedSpec && grantConfig.type === 'item' && Array.isArray(grantConfig.items)) {
                    for (const item of grantConfig.items) {
                        if (!item._legacySpecialization) {
                            item._legacySpecialization = extractedSpec;
                        }
                    }
                }

                const grantResults = result.applied.grantResults;
                const grantResult = await this._applySubGrant(actor, grantConfig, data, options);
                grantResults[`${optionLabel}:${i}`] = grantResult.applied;
                result.notifications.push(...grantResult.notifications);
                result.errors.push(...grantResult.errors);
            }
        }
    }

    /** @inheritDoc */
    async reverse(actor, appliedState): Promise<any> {
        const restoreData = {
            selectedOptions: appliedState.selectedOptions ?? [],
            grantResults: {},
        };

        // Reverse each applied grant in reverse order
        for (const [grantKey, grantApplied] of Object.entries(appliedState.grantResults ?? {})) {
            const [optionLabel, indexStr] = grantKey.split(':');
            const index = parseInt(indexStr);

            const option = this.options.find((o) => o.label === optionLabel);
            if (!option || !option.grants[index]) continue;

            const grantConfig = option.grants[index];
            const GrantClass = (this.constructor as any).GRANT_TYPES[grantConfig.type];
            if (!GrantClass) continue;

            const grant = new GrantClass(grantConfig);
            const reverseData = await grant.reverse(actor, grantApplied);
            restoreData.grantResults[grantKey] = reverseData;
        }

        return restoreData;
    }

    /** @inheritDoc */
    getAutomaticValue(): boolean {
        // Choices always require user interaction
        return false;
    }

    /** @inheritDoc */
    async getSummary(): Promise<void> {
        const summary = await super.getSummary();
        summary.icon = (this.constructor as any).ICON;
        summary.choiceCount = this.count;
        summary.options = [];

        for (const option of this.options) {
            const optionSummary = {
                label: option.label,
                description: option.description,
                grants: [],
            };

            for (const grantConfig of option.grants) {
                const GrantClass = (this.constructor as any).GRANT_TYPES[grantConfig.type];
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
    validateGrant(): void {
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
                const GrantClass = (this.constructor as any).GRANT_TYPES[grantConfig.type];
                if (!GrantClass) {
                    errors.push(`Unknown grant type "${grantConfig.type}" in option "${option.label}"`);
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
    _applySubGrant(actor, grantConfig, data, options): any {
        const GrantClass = (this.constructor as any).GRANT_TYPES[grantConfig.type];
        if (!GrantClass) {
            return {
                success: false,
                applied: {},
                notifications: [],
                errors: [`Unknown grant type: ${grantConfig.type}`],
            };
        }

        // Ensure grant config has required fields with defaults
        const fullConfig = {
            _id: grantConfig._id || foundry.utils.randomID(),
            type: grantConfig.type,
            optional: grantConfig.optional ?? false,
            ...grantConfig,
        };

        const grant = new GrantClass(fullConfig);

        // Pass through any sub-grant specific data
        const subData = data.subGrants?.[grantConfig._id] ?? {};

        return grant.apply(actor, subData, options);
    }
}
