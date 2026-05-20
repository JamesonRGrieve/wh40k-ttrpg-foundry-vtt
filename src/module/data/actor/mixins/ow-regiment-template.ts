/**
 * @file Only War — Regiment Creation actor schema mixin (#151).
 *
 * Exposes the persisted shape of the OW Regiment Creation outcome:
 *
 *   - `regimentSelection`  — what the player picked across the six
 *     12-point Regiment Creation categories (Home World, Commanding
 *     Officer, Regiment Type, Training Doctrines, Special Equipment
 *     Doctrines, Favoured Weapons).
 *   - `regimentKit`        — chosen Standard Kit entries, each carrying
 *     its own point cost against the 30-point kit budget.
 *
 * Per Direction #7 the OPTIONS that populate these slots are content
 * (compendium documents), never enum'd in `src/`. Each slot holds the
 * compendium UUID of the picked option; the engine
 * (`src/module/rules/ow-regiment-creation.ts`) reads them and applies
 * grants.
 *
 * The brief calls for a "schema-fields" mixin shape rather than the
 * full TypeDataModel mixin used by horde-template.ts — the consumer
 * data model spreads `owRegimentSchemaFields()` into its own
 * `defineSchema()` and applies `OwRegimentDeclarations` via `declare`
 * on the class. This keeps the mixin actor-coupling-free and avoids
 * adding another layer to the Mixin chain.
 */

const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;

/* -------------------------------------------------------------------- */
/*  Public declaration shape (mirror of the schema below)               */
/* -------------------------------------------------------------------- */

/**
 * Mirror of the schema below as a TypeScript declaration. The
 * consuming DataModel applies this via:
 *
 *     declare regimentSelection: OwRegimentDeclarations['regimentSelection'];
 *     declare regimentKit: OwRegimentDeclarations['regimentKit'];
 *
 * so the engine's `RegimentSelection` and the actor's persisted slot
 * stay in lock-step at the type level.
 */
export interface OwRegimentDeclarations {
    regimentSelection: {
        homeWorld: string;
        commandingOfficer: string;
        regimentType: string;
        trainingDoctrines: string[];
        specialEquipmentDoctrines: string[];
        favouredWeapons: {
            close: string;
            ranged: string;
        };
    };
    regimentKit: ReadonlyArray<{
        id: string;
        cost: number;
    }>;
}

/* -------------------------------------------------------------------- */
/*  Schema-fields factory                                               */
/* -------------------------------------------------------------------- */

/**
 * Returns the `{ regimentSelection, regimentKit }` schema slot map for
 * the OW Regiment Creation outcome. The consumer DataModel spreads this
 * into its `defineSchema()` return value.
 *
 * Defaults are empty strings (single-pick categories) and empty arrays
 * (multi-pick + kit) — equivalent to `emptyRegimentSelection()` in the
 * engine, but expressed at the persistence layer.
 */
export function owRegimentSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        regimentSelection: new SchemaField({
            homeWorld: new StringField({ required: true, initial: '', blank: true }),
            commandingOfficer: new StringField({ required: true, initial: '', blank: true }),
            regimentType: new StringField({ required: true, initial: '', blank: true }),
            trainingDoctrines: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: [] }),
            specialEquipmentDoctrines: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: [] }),
            favouredWeapons: new SchemaField({
                close: new StringField({ required: true, initial: '', blank: true }),
                ranged: new StringField({ required: true, initial: '', blank: true }),
            }),
        }),
        regimentKit: new ArrayField(
            new SchemaField({
                id: new StringField({ required: true, blank: false }),
                cost: new NumberField({ required: true, initial: 0, integer: true }),
            }),
            { required: true, initial: [] },
        ),
    };
}
