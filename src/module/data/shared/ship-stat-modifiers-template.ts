import SystemDataModel from '../abstract/system-data-model.ts';

/** The nine ship stats a component / upgrade can modify, in canonical order. */
export const SHIP_STAT_KEYS = [
    'speed',
    'manoeuvrability',
    'detection',
    'armour',
    'hullIntegrity',
    'turretRating',
    'voidShields',
    'morale',
    'crewRating',
] as const;

/** Structured shape of the ship-stat modifier block. */
export type ShipStatModifiers = Record<(typeof SHIP_STAT_KEYS)[number], number>;

/**
 * Template owning the shared ship-stat `modifiers` SchemaField plus the
 * `hasModifiers` / `modifiersList` getters. Adopted by ship-component and
 * ship-upgrade so the nine-field block (and its localized display list) lives
 * in one place — adding or renaming a ship stat is a single edit.
 *
 * @mixin
 */
export default class ShipStatModifiersTemplate extends SystemDataModel {
    // Typed property declaration matching defineSchema()
    declare modifiers: ShipStatModifiers;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const block: Record<string, foundry.data.fields.DataField.Any> = {};
        for (const key of SHIP_STAT_KEYS) {
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
    get modifiersList(): Array<{ key: string; label: string; value: number }> {
        const list: Array<{ key: string; label: string; value: number }> = [];
        for (const [key, value] of Object.entries(this.modifiers)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.ShipStat.${key.capitalize()}`),
                    value,
                });
            }
        }
        return list;
    }
}
