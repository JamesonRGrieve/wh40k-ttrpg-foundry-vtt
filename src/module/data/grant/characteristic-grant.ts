import BaseGrantData from './base-grant.ts';

/**
 * Grant that provides characteristic bonuses to an actor.
 * Modifies characteristic advance values.
 *
 * @extends BaseGrantData
 */
export default class CharacteristicGrantData extends (BaseGrantData as any) {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static TYPE = 'characteristic';
    static ICON = 'icons/svg/dice-target.svg';

    /**
     * Valid characteristic keys.
     * @type {Set<string>}
     */
    static VALID_CHARACTERISTICS = new Set([
        'weaponSkill',
        'ballisticSkill',
        'strength',
        'toughness',
        'agility',
        'intelligence',
        'perception',
        'willpower',
        'fellowship',
    ]);

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Characteristics to modify
            characteristics: new fields.ArrayField(
                new fields.SchemaField({
                    // Characteristic key
                    key: new fields.StringField({ required: true }),
                    // Value to add (positive or negative)
                    value: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    // Is this optional?
                    optional: new fields.BooleanField({ initial: false }),
                }),
                { required: true, initial: [] },
            ),

            // Applied state - tracks what was granted
            // Format: { "characteristicKey": { previousValue, appliedValue } }
            applied: new fields.ObjectField({ required: true, initial: {} }),
        };
    }

    /* -------------------------------------------- */
    /*  Grant Application Methods                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _applyGrant(actor: any, data: any, options: Record<string, any>, result: any): Promise<void> {
        const selectedChars = data.selected ?? this.characteristics.map((c) => c.key);
        const updates = {};

        for (const charConfig of this.characteristics) {
            const { key, value, optional: charOptional } = charConfig;

            if (!(this.constructor as any).VALID_CHARACTERISTICS.has(key)) {
                result.errors.push(`Invalid characteristic: ${key}`);
                continue;
            }
            if (!selectedChars.includes(key)) {
                if (!charOptional && !this.optional) result.errors.push(`Required characteristic ${key} not selected`);
                continue;
            }
            if (value === 0) continue;

            const currentAdvance = actor.system?.characteristics?.[key]?.advance ?? 0;
            const newAdvance = currentAdvance + value;

            updates[`system.characteristics.${key}.advance`] = newAdvance;
            result.applied[key] = { previousValue: currentAdvance, appliedValue: value, newValue: newAdvance };

            const charLabel = game.i18n.localize(`WH40K.Characteristic.${key}`);
            result.notifications.push(`${charLabel} ${value > 0 ? '+' : ''}${value}`);
        }

        await this._applyUpdates(actor, updates, options);
    }

    /** @inheritDoc */
    async reverse(actor, appliedState): Promise<any> {
        const restoreData = { characteristics: {} };
        const updates = {};

        for (const [key, state] of Object.entries(appliedState) as [string, any][]) {
            if (state.previousValue !== undefined) {
                updates[`system.characteristics.${key}.advance`] = state.previousValue;
                restoreData.characteristics[key] = state;
            }
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        return restoreData;
    }

    /** @inheritDoc */
    async restore(actor, restoreData): Promise<any> {
        const result = this._initResult();
        const updates = {};

        for (const [key, state] of Object.entries(restoreData.characteristics ?? {}) as [string, any][]) {
            const currentAdvance = actor.system?.characteristics?.[key]?.advance ?? 0;
            const newAdvance = currentAdvance + state.appliedValue;
            updates[`system.characteristics.${key}.advance`] = newAdvance;
            result.applied[key] = { previousValue: currentAdvance, appliedValue: state.appliedValue, newValue: newAdvance };
        }

        await this._applyUpdates(actor, updates, {});
        return result;
    }

    /** @inheritDoc */
    getAutomaticValue(): Record<string, any> | false {
        if (this.optional) return false;
        if (this.characteristics.some((c) => c.optional)) return false;
        return { selected: this.characteristics.map((c) => c.key) };
    }

    /** @inheritDoc */
    async getSummary(): Promise<any> {
        const summary = await super.getSummary();
        summary.icon = (this.constructor as any).ICON;

        for (const charConfig of this.characteristics) {
            const label = game.i18n.localize(`WH40K.Characteristic.${charConfig.key}`);
            const sign = charConfig.value > 0 ? '+' : '';

            summary.details.push({
                label: label,
                value: `${sign}${charConfig.value}`,
                optional: charConfig.optional,
            });
        }

        return summary;
    }

    /** @inheritDoc */
    validateGrant(): any {
        const errors = super.validateGrant();

        const characteristics = this.characteristics ?? [];
        for (const charConfig of characteristics) {
            if (!(this.constructor as any).VALID_CHARACTERISTICS.has(charConfig.key)) {
                errors.push(`Invalid characteristic key: ${charConfig.key}`);
            }
        }

        return errors;
    }
}
