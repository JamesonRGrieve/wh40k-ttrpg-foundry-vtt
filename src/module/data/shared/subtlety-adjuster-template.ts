import SystemDataModel from '../abstract/system-data-model.ts';
import { type SubtletyAdjusterEffect, type SubtletyAdjusterKind, subtletyAdjusterEffectOf } from './subtlety-adjuster.ts';

/**
 * Template adding a structured `system.subtletyAdjuster` slot so that
 * compendium content (origin paths, talents, weapons) is the single source of
 * truth for how it moves the warband's Subtlety pool. The runtime tree-walks
 * the actor's owned items / origin path and reads this field — no Subtlety
 * deltas, clamps, or source labels are hardcoded in `src/` (CLAUDE.md
 * Direction #7). Pure types + the normalizer live in `./subtlety-adjuster.ts`
 * so they are unit-testable without the Foundry runtime.
 *
 * The field is fully optional with `initial: undefined`, so the vast majority
 * of legacy compendium documents that omit it validate cleanly under V14
 * strict cleaning. Nested numeric fields are coerced from strings by
 * `ItemDataModel._cleanData`'s schema-field recursion, so no `_cleanData`
 * override is needed here; `cleanData` is intentionally NOT overridden so the
 * `_state` forwarding in `SystemDataModel.cleanData` is preserved.
 *
 * @mixin
 */
export default class SubtletyAdjusterTemplate extends SystemDataModel {
    // Typed property declaration matching defineSchema(). Optional because the
    // outer SchemaField uses `initial: undefined` — absent on most documents.
    declare subtletyAdjuster?: {
        kind: SubtletyAdjusterKind;
        delta: number;
        minAbsoluteDelta: number;
        requiresEquipped: boolean;
    };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            subtletyAdjuster: new fields.SchemaField(
                {
                    kind: new fields.StringField({
                        required: true,
                        initial: 'none',
                        blank: false,
                        choices: ['none', 'clamp', 'passive', 'event'],
                    }),
                    // Signed delta for passive/event adjusters. Ignored when
                    // kind is 'clamp' or 'none'.
                    delta: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    // Quarantine-World style "resist loss, keep at least N"
                    // magnitude. Read only when kind === 'clamp'.
                    minAbsoluteDelta: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    // Passive effects on equippable items (weapons) only count
                    // while the item is actually wielded.
                    requiresEquipped: new fields.BooleanField({ required: true, initial: false }),
                },
                { required: false, nullable: false, initial: undefined },
            ),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Normalized Subtlety effect for this item, or `null` when the entry
     * carries no adjuster (field absent or `kind: 'none'`). Consumers read
     * this instead of the raw schema so they never branch on storage shape.
     */
    get subtletyAdjusterEffect(): SubtletyAdjusterEffect | null {
        return subtletyAdjusterEffectOf(this.subtletyAdjuster);
    }
}
