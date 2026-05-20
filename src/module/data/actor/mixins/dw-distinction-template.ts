/**
 * Deathwatch Distinctions / Marks of Distinction DataModel mixin (#171).
 *
 * Persists the set of Distinction ids the Battle-Brother has earned and
 * the subset of those that have been crystallised into permanent Marks
 * of Distinction. The rules engine in `src/module/rules/dw-distinction.ts`
 * (gate checks, Renown-arithmetic on award, merge of multiple Marks into
 * a single grant payload) is pure — this module owns only the
 * persistence shape and the typed declarations the Character DataModel
 * class spreads / declares.
 *
 * RAW reference: rites.md "DISTINCTIONS" (p. 3046) and "ADVANCED SPECIAL
 * ABILITIES" (p. 3404). Distinction definitions, their Renown rewards,
 * and the structured grant payloads are content (compendium-sourced,
 * Direction #7); this schema stores only the ids the actor carries.
 *
 * Two parallel arrays:
 *   - `distinctions`        — every Distinction id earned (honours).
 *   - `marksOfDistinction`  — the subset embodied as a permanent Mark.
 *
 * The two are not nested because not every Distinction becomes a Mark
 * (many are purely ceremonial Renown awards) and the orchestrator-built
 * panel context joins them at render time via the engine's
 * `mergeMarkGrants` over content definitions resolved from compendium.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/171.json`):
 *   - spread `dwDistinctionSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `DwDistinctionDeclarations` to the class with a `declare` block
 */

const { ArrayField, StringField } = foundry.data.fields;

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...dwDistinctionSchemaFields(),
 *   };
 * }
 * ```
 *
 * Both arrays store opaque ids (kebab-case canonical slugs or compendium
 * item ids) so unknown / future Distinctions round-trip cleanly through
 * persistence even when the rules engine has no dispatch entry for them
 * yet. Validation against the compendium-resolved Distinction catalogue
 * happens at the rules-engine boundary (gate checks, mark merge), not at
 * the schema level — keeping the persisted shape forward-compatible with
 * content additions that ship via compendium before code knows about them.
 */
export function dwDistinctionSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        distinctions: new ArrayField(new StringField({ required: true, blank: false }), {
            required: true,
            initial: [],
        }),
        marksOfDistinction: new ArrayField(new StringField({ required: true, blank: false }), {
            required: true,
            initial: [],
        }),
    };
}

/**
 * Typed declarations to be merged into the consuming DataModel class:
 *
 * ```ts
 * export default class CharacterData extends CreatureTemplate {
 *   declare distinctions:        DwDistinctionDeclarations['distinctions'];
 *   declare marksOfDistinction:  DwDistinctionDeclarations['marksOfDistinction'];
 *   // ...
 * }
 * ```
 *
 * Element types are plain `string` because the canonical Distinction id
 * union is content (compendium-resolved) rather than code; the rules
 * engine consumes the ids as opaque slugs and only the orchestrator-
 * built panel context narrows them against the live catalogue.
 */
export interface DwDistinctionDeclarations {
    /**
     * Distinction ids the Battle-Brother has been awarded (RAW: every
     * honour earned, whether ceremonial or crystallised as a Mark).
     */
    distinctions: string[];
    /**
     * The subset of `distinctions` embodied as permanent Marks of
     * Distinction. Every entry SHOULD also appear in `distinctions`,
     * but the action handlers tolerate drift so a stale Mark id never
     * vanishes silently — the panel context surfaces orphans for the GM
     * to reconcile.
     */
    marksOfDistinction: string[];
}
