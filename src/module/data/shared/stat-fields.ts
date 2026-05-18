/**
 * Shared actor-stat schema-field builders.
 *
 * `CreatureTemplate` (the PC / detailed-actor path, inherited by
 * `CharacterData`) and `NpcData` (which extends `ActorDataModel` directly,
 * not `CreatureTemplate`) previously hand-rolled near-identical characteristic
 * / wounds / size / initiative / movement SchemaFields that differed only in
 * default values and, for characteristics, whether the advancement triplet
 * (advance / cost / damage) is present. These builders centralise the field
 * construction so the two models stay structurally homologated; per-model
 * divergence is now explicit via options rather than copy-paste.
 *
 * Every option reproduces the exact field config the call sites used, so
 * adopting these builders is behaviour-preserving (no schema/migration change).
 */

const { NumberField, SchemaField, StringField } = foundry.data.fields;

type DataField = foundry.data.fields.DataField.Any;

export interface CharacteristicFieldOptions {
    /** Initial `base` value (0 for PCs/creatures, 30 for NPCs). */
    base: number;
    /** Initial derived `total`. */
    total: number;
    /** Initial derived `bonus`. */
    bonus: number;
    /**
     * Include the advancement triplet (`advance`, `cost`, `damage`). PCs /
     * creatures track XP advancement and recoverable characteristic damage;
     * NPCs use flat stat blocks and omit them.
     */
    advancement: boolean;
}

/** A single characteristic (WS / BS / S / …) sub-schema. */
export function characteristicField(label: string, short: string, opts: CharacteristicFieldOptions): DataField {
    const schema: Record<string, DataField> = {
        label: new StringField({ required: true, initial: label }),
        short: new StringField({ required: true, initial: short }),
        base: new NumberField({ required: true, initial: opts.base, integer: true }),
    };

    if (opts.advancement) {
        schema['advance'] = new NumberField({ required: true, initial: 0, min: 0, integer: true });
    }

    schema['modifier'] = new NumberField({ required: true, initial: 0, integer: true });
    schema['unnatural'] = new NumberField({ required: true, initial: 0, min: 0, integer: true });

    if (opts.advancement) {
        schema['cost'] = new NumberField({ required: true, initial: 0, min: 0, integer: true });
        /**
         * Recoverable characteristic damage (core.md §"Characteristic Damage").
         * Subtracted from the effective value and bonus during data prep so a
         * 30-WS character with `damage: 10` rolls against 20-WS. Restored by
         * rest and certain Medicae actions. Always ≥ 0.
         */
        schema['damage'] = new NumberField({ required: true, initial: 0, min: 0, integer: true });
    }

    // Derived values
    schema['total'] = new NumberField({ required: true, initial: opts.total, integer: true });
    schema['bonus'] = new NumberField({ required: true, initial: opts.bonus, integer: true });

    return new SchemaField(schema);
}

/** `wounds` sub-schema. `nullable: false` for the strict creature path. */
export function woundsField(opts: { max: number; value: number; critical?: number; nullable: boolean }): DataField {
    const n = (initial: number): DataField =>
        new NumberField({ required: true, initial, min: 0, integer: true, nullable: opts.nullable });
    return new SchemaField({
        max: n(opts.max),
        value: n(opts.value),
        critical: n(opts.critical ?? 0),
    });
}

/** `size` field (1–10, default 4). */
export function sizeField(opts: { nullable: boolean }): DataField {
    return new NumberField({ required: true, initial: 4, min: 1, max: 10, integer: true, nullable: opts.nullable });
}

/** `initiative` sub-schema. */
export function initiativeField(opts: { nullable: boolean }): DataField {
    return new SchemaField({
        characteristic: new StringField({ required: true, initial: 'agility' }),
        base: new StringField({ required: true, initial: '1d10' }),
        bonus: new NumberField({ required: true, initial: 0, integer: true, nullable: opts.nullable }),
    });
}

export interface MovementFieldOptions {
    half: number;
    full: number;
    charge: number;
    run: number;
    /** Include Strength-Bonus-derived leap/jump fields (creature path only). */
    withLeap: boolean;
}

/** `movement` sub-schema. */
export function movementField(opts: MovementFieldOptions): DataField {
    const n = (initial: number): DataField => new NumberField({ required: true, initial, min: 0 });
    const schema: Record<string, DataField> = {
        half: n(opts.half),
        full: n(opts.full),
        charge: n(opts.charge),
        run: n(opts.run),
    };
    if (opts.withLeap) {
        // Leap/Jump based on Strength Bonus
        schema['leapVertical'] = n(0);
        schema['leapHorizontal'] = n(0);
        schema['jump'] = n(0);
    }
    return new SchemaField(schema);
}
