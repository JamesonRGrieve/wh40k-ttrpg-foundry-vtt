/**
 * Deathwatch Special-Issue Ammunition DataModel mixin (#172).
 *
 * Persists a single piece of state — the currently-loaded Special-Issue
 * ammunition id — so the engine in `src/module/rules/dw-special-ammo.ts`
 * can resolve the per-shot effect at attack time. The engine itself is
 * pure; this mixin owns only the persistence shape and the typed
 * declarations the consuming DataModel class spreads / declares.
 *
 * RAW reference: the DW Special Issue Ammunition rules.
 * A Battle-Brother may load one of seven Special-Issue ammunition kinds
 * into a bolt-pattern weapon; otherwise the weapon fires standard
 * ammunition (no engine effect). We represent "no special ammo" as the
 * literal `'standard'` choice rather than `null` so the Foundry strict
 * StringField stays non-nullable and form-binding behaves predictably.
 *
 * The selection here is the **actor-level loadout default**: the engine
 * consumer (weapon-attack pipeline) may still override per-weapon by
 * reading an item-level ammo slot when one is added. The actor-level
 * value is the fallback / default selector surfaced on the character
 * sheet's overview tab.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/172.json`):
 *   - spread `dwAmmoSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `DwAmmoDeclarations` to the class with a `declare` block
 */

import { DW_SELECTED_AMMO_CHOICES, type DwSelectedAmmoId } from '../../../rules/dw-special-ammo.ts';

const { StringField } = foundry.data.fields;

type DataField = foundry.data.fields.DataField.Any;

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...dwAmmoSchemaFields(),
 *   };
 * }
 * ```
 *
 * Constrains `selectedAmmo` to the closed `DW_SELECTED_AMMO_CHOICES`
 * union via Foundry's `choices:` constraint so mis-typed legacy data is
 * rejected by V14 strict validation. Initial value is `'standard'` —
 * i.e., no special ammunition loaded.
 */
export function dwAmmoSchemaFields(): Record<string, DataField> {
    return {
        selectedAmmo: new StringField({
            required: true,
            initial: 'standard',
            choices: [...DW_SELECTED_AMMO_CHOICES],
            blank: false,
        }),
    };
}

/**
 * Typed declarations to be merged into the consuming DataModel class:
 *
 * ```ts
 * export default class CharacterData extends CreatureTemplate {
 *   declare selectedAmmo: DwAmmoDeclarations['selectedAmmo'];
 *   // ...
 * }
 * ```
 */
export interface DwAmmoDeclarations {
    /**
     * Currently-loaded Special-Issue ammunition id at the actor scope,
     * or `'standard'` when no special ammunition is loaded. The attack
     * pipeline resolves the per-shot effect via `getAmmoEffect(id)`
     * for any value other than `'standard'`.
     */
    selectedAmmo: DwSelectedAmmoId;
}
