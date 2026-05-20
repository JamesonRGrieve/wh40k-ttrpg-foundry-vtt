/**
 * Only War "Comrade in Combat" (#152 — core.md §"COMRADES IN COMBAT", p.12137)
 * schema slot.
 *
 * Each OW PC has exactly ONE Comrade — an NPC abstraction acting on the
 * PC's turn, with a tiny three-step state track (unharmed → wounded →
 * dead). The Cohesion check, hit-transfer arbitration, Fear / Pinning
 * mirror, and mental-damage death gate are pure rules functions in
 * `src/module/rules/ow-comrade.ts`. This file owns the actor-side
 * persistence:
 *
 *   - `comrade.name`           — display name; defaults to '' until set.
 *   - `comrade.state`          — current track state ('unharmed' | 'wounded' | 'dead').
 *   - `comrade.distanceM`      — current distance (m) from PC, for the
 *                                5 m Cohesion check.
 *   - `comrade.hasVisualLine`  — whether the PC currently has visual
 *                                line on the Comrade.
 *
 * The orchestrator merges `owComradeSchemaFields()` into the
 * CharacterData defineSchema() and applies the `OwComradeDeclarations`
 * shape to the class via the standard `declare` block. The panel and
 * actions read these fields off `system.comrade`; no class-level mixin
 * is needed for this round.
 *
 * Fields stay safe to materialise on non-OW actors — they keep their
 * `initial` values and never render because the panel include is gated
 * on `isOW`.
 */

import type { ComradeState } from '../../../rules/ow-comrade.ts';

const { SchemaField, StringField, NumberField, BooleanField } = foundry.data.fields;

/** Allowed states for the Comrade state-track field. */
const COMRADE_STATE_CHOICES = ['unharmed', 'wounded', 'dead'] as const satisfies readonly ComradeState[];

/**
 * Shape of the `system.comrade` sub-document the panel + actions read.
 * Mirrors the SchemaField below so the compiler narrows access without
 * casts.
 */
export interface OwComradeData {
    /** Display name; blank until the player names their Comrade. */
    name: string;
    /** Current state on the unharmed → wounded → dead track. */
    state: ComradeState;
    /** Distance from the PC, in metres (used by `inCohesion`). */
    distanceM: number;
    /** Whether the PC currently has visual line on the Comrade. */
    hasVisualLine: boolean;
}

/**
 * Class-level `declare` shape contributed by the Comrade schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.comrade.state` etc. without casts.
 */
export interface OwComradeDeclarations {
    comrade: OwComradeData;
}

/**
 * Schema-field bundle for the Comrade. Spread into a DataModel's
 * `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owComradeSchemaFields(),
 *     };
 *
 * Defaults: unnamed, unharmed, in support range (0 m), with visual line.
 * The panel include is gated on `isOW`, so a non-OW actor never sees
 * these values.
 */
export function owComradeSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        comrade: new SchemaField({
            name: new StringField({ required: true, initial: '', blank: true }),
            state: new StringField({
                required: true,
                initial: 'unharmed',
                blank: false,
                choices: [...COMRADE_STATE_CHOICES],
            }),
            distanceM: new NumberField({ required: true, initial: 0, min: 0 }),
            hasVisualLine: new BooleanField({ required: true, initial: true }),
        }),
    };
}
