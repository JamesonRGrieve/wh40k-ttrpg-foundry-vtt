import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import BaseGrantData, { type GrantApplicationResult, type GrantApplyOptions, type GrantRestoreData, type GrantSummary } from './base-grant.ts';

interface CharacteristicAppliedState {
    previousValue: number;
    appliedValue: number;
    newValue?: number;
}

interface CharacteristicRestoreData {
    characteristics: Record<string, CharacteristicAppliedState>;
}

interface CharacteristicActorSystem {
    characteristics: Record<string, { advance?: number } | undefined>;
}

/**
 * Grant that provides characteristic bonuses to an actor.
 * Modifies characteristic advance values.
 *
 * @extends BaseGrantData
 */
export default class CharacteristicGrantData extends BaseGrantData {
    /* -------------------------------------------- */
    /*  Static Properties                           */
    /* -------------------------------------------- */

    static override TYPE = 'characteristic';
    static override ICON = 'icons/svg/dice-target.svg';

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

    /** Property declarations */
    declare characteristics: Array<{ key: string; value: number; optional: boolean }>;
    declare applied: Record<string, { previousValue: number; appliedValue: number; newValue: number }>;

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
    override async _applyGrant(actor: WH40KBaseActor, data: GrantRestoreData, options: GrantApplyOptions, result: GrantApplicationResult): Promise<void> {
        const ctor = this.constructor as typeof CharacteristicGrantData;
        const selectedChars: string[] = Array.isArray(data['selected']) ? (data['selected'] as string[]) : this.characteristics.map((c) => c.key);
        const updates: Record<string, number> = {};
        const charSystem = actor.system as CharacteristicActorSystem;

        for (const charConfig of this.characteristics) {
            const { key, value, optional: charOptional } = charConfig;

            if (!ctor.VALID_CHARACTERISTICS.has(key)) {
                result.errors.push(`Invalid characteristic: ${key}`);
                continue;
            }
            if (!selectedChars.includes(key)) {
                if (!charOptional && !this.optional) result.errors.push(`Required characteristic ${key} not selected`);
                continue;
            }
            if (value === 0) continue;

            const currentAdvance: number = charSystem.characteristics[key]?.advance ?? 0;
            const newAdvance = currentAdvance + value;

            updates[`system.characteristics.${key}.advance`] = newAdvance;
            result.applied[key] = { previousValue: currentAdvance, appliedValue: value, newValue: newAdvance };

            const charLabel = game.i18n.localize(`WH40K.Characteristic.${key}`);
            result.notifications.push(`${charLabel} ${value > 0 ? '+' : ''}${value}`);
        }

        await this._applyUpdates(actor, updates, options);
    }

    /** @inheritDoc */
    override async reverse(actor: WH40KBaseActor, appliedState: Record<string, CharacteristicAppliedState>): Promise<CharacteristicRestoreData> {
        const restoreData: CharacteristicRestoreData = { characteristics: {} };
        const updates: Record<string, number> = {};

        for (const [key, state] of Object.entries(appliedState)) {
            updates[`system.characteristics.${key}.advance`] = state.previousValue;
            restoreData.characteristics[key] = state;
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

        return restoreData;
    }

    /** @inheritDoc */
    override async restore(actor: WH40KBaseActor, restoreData: GrantRestoreData): Promise<GrantApplicationResult> {
        const result = this._initResult();
        const updates: Record<string, number> = {};
        const charSystem = actor.system as CharacteristicActorSystem;

        // eslint-disable-next-line no-restricted-syntax -- boundary: GrantRestoreData payload typed at base
        const characteristics = (restoreData as Partial<CharacteristicRestoreData>).characteristics ?? {};
        for (const [key, state] of Object.entries(characteristics)) {
            const currentAdvance: number = charSystem.characteristics[key]?.advance ?? 0;
            const newAdvance = currentAdvance + state.appliedValue;
            updates[`system.characteristics.${key}.advance`] = newAdvance;
            result.applied[key] = { previousValue: currentAdvance, appliedValue: state.appliedValue, newValue: newAdvance };
        }

        await this._applyUpdates(actor, updates, {});
        return result;
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: payload feeds into apply() data
    override getAutomaticValue(): Record<string, unknown> | false {
        if (this.optional) return false;
        if (this.characteristics.some((c) => c.optional)) return false;
        return { selected: this.characteristics.map((c) => c.key) };
    }

    /** @inheritDoc */
    override async getSummary(): Promise<GrantSummary> {
        const ctor = this.constructor as typeof CharacteristicGrantData;
        const summary = await super.getSummary();
        summary.icon = ctor.ICON;

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
    override validateGrant(): string[] {
        const ctor = this.constructor as typeof CharacteristicGrantData;
        const errors = super.validateGrant();

        for (const charConfig of this.characteristics) {
            if (!ctor.VALID_CHARACTERISTICS.has(charConfig.key)) {
                errors.push(`Invalid characteristic key: ${charConfig.key}`);
            }
        }

        return errors;
    }
}
