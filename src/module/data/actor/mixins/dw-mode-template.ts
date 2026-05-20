/**
 * Deathwatch Squad Mode / Solo Mode schema fields (#163).
 *
 * Pure schema-fields builder — exports a function that returns the
 * `Record<string, DataField>` to be spread into a `defineSchema()` call,
 * plus a `declare`-only interface the orchestrator splices into the
 * CharacterData class. Mirrors the `shared/stat-fields.ts` pattern: no
 * mixin class, no actor coupling.
 *
 * The engine logic itself lives in `src/module/rules/dw-squad-mode.ts`
 * (mode transitions, Support Range table, ability activation); these
 * fields just persist the two pieces of state that engine needs from a
 * Battle-Brother actor:
 *
 *   - `combatMode` — the current mode ('solo' default, 'squad' once the
 *     brother has spent a Full Action or passed a Cohesion Challenge).
 *     RAW: every Battle-Brother starts a scene in Solo Mode.
 *   - `sustainedAbilities` — list of ability identifiers (compendium
 *     UUIDs / slugs) the brother is currently sustaining. RAW: a
 *     Sustained Squad-mode ability persists turn-over-turn without
 *     re-paying its Cohesion cost so long as the activator remains in
 *     Squad Mode. The list is cleared on a Squad → Solo transition by
 *     the action handler, not by the schema.
 *
 * Naming convention: the schema-fields function is `dwModeSchemaFields`
 * and the declarations interface is `DwModeDeclarations` — both lower-
 * camelCase for the builder, PascalCase for the type, matching the
 * shape the orchestrator merges into `CharacterData.defineSchema()` and
 * the class-level `declare` block.
 */

import type { DwMode } from '../../../rules/dw-squad-mode.ts';

const { StringField, ArrayField } = foundry.data.fields;

type DataField = foundry.data.fields.DataField.Any;

/**
 * Schema field builder for Deathwatch combat-mode state.
 *
 * Spread the result into a DataModel `defineSchema()`. Initial values
 * match the RAW defaults (`combatMode: 'solo'`, `sustainedAbilities:
 * []`) so a fresh actor / NPC is in Solo Mode with no sustained
 * abilities.
 *
 * The `combatMode` field is constrained to the engine's `DwMode` union
 * via `choices: ['solo', 'squad']`; mis-typed legacy data is rejected
 * by Foundry V14's strict validation.
 */
export function dwModeSchemaFields(): Record<string, DataField> {
    return {
        combatMode: new StringField({
            required: true,
            initial: 'solo',
            choices: ['solo', 'squad'],
            blank: false,
        }),
        sustainedAbilities: new ArrayField(new StringField({ required: true, blank: false }), {
            required: true,
            initial: [],
        }),
    };
}

/**
 * Class-level `declare` shape for the Deathwatch combat-mode fields.
 *
 * The orchestrator inserts these declarations onto `CharacterData` (and
 * `NpcData`, if the manifest's `applyTo` widens that way). Strong-typed
 * so the engine functions in `rules/dw-squad-mode.ts` can be called
 * directly with `actor.system.combatMode` without a cast.
 */
export interface DwModeDeclarations {
    /** Current combat mode for a Deathwatch Battle-Brother. */
    combatMode: DwMode;
    /**
     * Compendium-resolved identifiers (UUID or slug) for Squad-mode
     * abilities the Battle-Brother is currently sustaining. Cleared on
     * a Squad → Solo transition by the leave-squad action handler.
     */
    sustainedAbilities: string[];
}
