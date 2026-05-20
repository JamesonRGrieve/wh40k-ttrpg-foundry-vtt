/**
 * Black Crusade Psychic Strength DataModel mixin (#178).
 *
 * Persists the minimum state the pure resolver in
 * `src/module/rules/bc-psychic-strength.ts` reads:
 *
 *   - `psykerClass`         — one of 'bound' | 'unbound' | 'daemonic' (BC
 *                             Table 6-1). Drives the per-class push
 *                             ceiling consumed by {@link maxPushLevel}.
 *   - `psyRating`           — base PR from the actor's profile.
 *   - `sustainedPowerCount` — total powers currently being sustained.
 *                             The first sustain is "free" (no penalty);
 *                             each additional power adds -10 to all
 *                             related psychic tests per {@link sustainPenalty}.
 *
 * The chosen Mode (fettered / unfettered / push) and Push Level are
 * dialog-scoped — they're per-test parameters, not persisted state — so
 * they live on the action handler / chat card path, not on the DataModel.
 *
 * Wiring is performed by the orchestrator (see `.integration-staging/178.json`):
 *   - spread `bcPsychicSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `BcPsychicDeclarations` to the class with a `declare` block
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond
 * the field constructors. Non-BC actors still get the fields (defaults
 * of `'bound'` / 0 / 0); the panel and action are gated on
 * `actor._gameSystemId === 'bc'` so the surface is invisible elsewhere.
 */

import type { PsykerClass } from '../../../rules/bc-psychic-strength.ts';

const { NumberField, StringField } = foundry.data.fields;

/** BC Psyker Class choices, mirroring the {@link PsykerClass} union. */
const PSYKER_CLASS_CHOICES: readonly PsykerClass[] = ['bound', 'unbound', 'daemonic'];

/**
 * Class-level `declare` shape contributed by the BC Psychic schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.psyRating` etc. without casts.
 */
export interface BcPsychicDeclarations {
    /** BC Psyker Class (Table 6-1) — drives push ceiling. */
    psykerClass: PsykerClass;
    /** Base Psy Rating from the actor's profile (non-negative integer). */
    psyRating: number;
    /** Total powers currently being sustained (non-negative integer). */
    sustainedPowerCount: number;
}

/**
 * Schema-field bundle for the BC Psychic Strength engine. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...bcPsychicSchemaFields(),
 *     };
 *
 * Every field has a safe initial so non-BC actors that happen to be
 * reflected over this schema still validate — the panel gate keeps the
 * values invisible to the player.
 */
export function bcPsychicSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        psykerClass: new StringField({
            required: true,
            blank: false,
            initial: 'bound',
            choices: [...PSYKER_CLASS_CHOICES],
        }),
        psyRating: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
        sustainedPowerCount: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
    };
}
