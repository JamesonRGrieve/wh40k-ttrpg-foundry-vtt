import { formatSigned } from '../../utils/format.ts';
import SystemDataModel from '../abstract/system-data-model.ts';

/** The four vehicle stats a trait / upgrade can modify, in canonical order. */
export const VEHICLE_STAT_KEYS = ['speed', 'manoeuvrability', 'armour', 'integrity'] as const;

/** Structured shape of the vehicle-stat modifier block. */
export type VehicleStatModifiers = Record<(typeof VEHICLE_STAT_KEYS)[number], number>;

/**
 * Template owning the shared vehicle-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` getters. Adopted by vehicle-trait and
 * vehicle-upgrade so the four-field block (and its localized display list,
 * including the `formatted` signed string) lives in one place.
 *
 * @mixin
 */
export default class VehicleStatModifiersTemplate extends SystemDataModel {
    // Typed property declaration matching defineSchema()
    declare modifiers: VehicleStatModifiers;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const block: Record<string, foundry.data.fields.DataField.Any> = {};
        for (const key of VEHICLE_STAT_KEYS) {
            block[key] = new fields.NumberField({ required: true, initial: 0, integer: true });
        }
        return {
            modifiers: new fields.SchemaField(block),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Has any non-zero modifiers?
     * @type {boolean}
     */
    get hasModifiers(): boolean {
        return Object.values(this.modifiers).some((v) => v !== 0);
    }

    /**
     * Get modifiers as a formatted list.
     * @type {object[]}
     */
    get modifiersList(): Array<{ key: string; label: string; value: number; formatted: string }> {
        const list: Array<{ key: string; label: string; value: number; formatted: string }> = [];
        for (const [key, value] of Object.entries(this.modifiers)) {
            if (value !== 0) {
                const label = game.i18n.localize(`WH40K.VehicleStat.${key.charAt(0).toUpperCase()}${key.slice(1)}`);
                list.push({
                    key,
                    label,
                    value,
                    formatted: `${formatSigned(value)}`,
                });
            }
        }
        return list;
    }
}
