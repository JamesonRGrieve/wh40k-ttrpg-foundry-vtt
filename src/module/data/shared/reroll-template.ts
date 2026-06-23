import SystemDataModel from '../abstract/system-data-model.ts';

/**
 * REROLL TEMPLATE
 *
 * Content-driven re-roll variants. A talent or trait that grants a re-roll
 * declares a `reroll` block; at resolution time `WH40KBaseActor.getRerollOptions`
 * walks the actor's owned items, filters each declared re-roll by applicability
 * (test type / key + success-or-failure condition) and use-availability, and
 * surfaces it on the roll-result chat card as a button SEPARATE from the global
 * Spend-Fate re-roll. The `wh40k.collectRerollOptions` hook lets modules add more.
 *
 * Per Direction #7 the mechanic values (which test, what modifier, how often)
 * live in the compendium item's `_source`, never hardcoded in `src/`.
 *
 * Fields:
 *  - `enabled`   — gate; `false` (default) means the item grants no re-roll.
 *  - `modifier`  — signed modifier applied to the RE-ROLLED test (e.g. −10). 0 =
 *                  a plain re-roll. Folded into `rollData.modifiers` so it shows
 *                  on the card breakdown.
 *  - `condition` — when the variant is offered relative to the original result:
 *                  `failed` (default), `success`, or `any`.
 *  - `appliesTo` — which tests the re-roll covers: `any`, or restricted by
 *                  `types` (matched against `rollData.type`, e.g. `Characteristic`
 *                  / `Skill` / `Attack`) or `keys` (matched against
 *                  `rollData.rollKey`, e.g. `awareness` / `willpower`).
 *  - `frequency` — `at-will` (no tracking), `per-encounter`, or `per-session`.
 *                  Windowed frequencies are consumed via an actor flag ledger and
 *                  reset by the engine.
 *  - `uses`      — uses allowed per frequency window (ignored for `at-will`).
 *  - `label`     — optional button-label override; defaults to the item name.
 *
 * @mixin
 */
export default class RerollTemplate extends SystemDataModel {
    // Typed property declaration matching defineSchema()
    declare reroll: {
        enabled: boolean;
        modifier: number;
        condition: 'failed' | 'success' | 'any';
        appliesTo: { mode: 'any' | 'types' | 'keys'; types: string[]; keys: string[] };
        frequency: 'at-will' | 'per-encounter' | 'per-session';
        uses: number;
        label: string;
    };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            reroll: new fields.SchemaField({
                enabled: new fields.BooleanField({ required: true, initial: false }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                condition: new fields.StringField({ required: true, initial: 'failed', choices: ['failed', 'success', 'any'] }),
                appliesTo: new fields.SchemaField({
                    mode: new fields.StringField({ required: true, initial: 'any', choices: ['any', 'types', 'keys'] }),
                    types: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] }),
                    keys: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] }),
                }),
                frequency: new fields.StringField({ required: true, initial: 'at-will', choices: ['at-will', 'per-encounter', 'per-session'] }),
                uses: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
                label: new fields.StringField({ required: false, blank: true, initial: '' }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritdoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._migrateData receives raw unknown source data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        RerollTemplate.#normalizeReroll(source);
    }

    /**
     * Ensure a partially-authored `reroll` block has its nested `appliesTo`
     * container so strict validation doesn't drop the whole item.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #normalizeReroll(source: Record<string, unknown>): void {
        if (source['reroll'] === null || source['reroll'] === undefined) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: reroll is a raw object from source data before schema validation
        const reroll = source['reroll'] as Record<string, unknown>;
        if (!('appliesTo' in reroll) || reroll['appliesTo'] === undefined) {
            reroll['appliesTo'] = { mode: 'any', types: [], keys: [] };
        }
    }

    /* -------------------------------------------- */

    /**
     * Whether this item grants a re-roll variant.
     * @type {boolean}
     */
    get hasReroll(): boolean {
        return this.reroll.enabled;
    }
}
