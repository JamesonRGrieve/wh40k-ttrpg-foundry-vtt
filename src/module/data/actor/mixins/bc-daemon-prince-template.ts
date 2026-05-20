/**
 * Black Crusade Daemon Prince ascension DataModel mixin (#182).
 *
 * Persists the minimum state the pure resolver in
 * `src/module/rules/bc-daemon-prince.ts` reads back to determine whether
 * a character has undergone apotheosis and to compose the boost:
 *
 *   - `daemonPrinceAscension`        — `SchemaField` slot whose presence
 *                                       (non-null `ascendedAt`) means the
 *                                       character has ascended.
 *     - `ascendedAt`                 — World time (or session number) of
 *                                       apotheosis. `null` = never ascended.
 *     - `alignmentAtAscension`       — The Chaos alignment held at the
 *                                       moment of ascension. Preserved for
 *                                       downstream patron-effect tooling.
 *
 * Wiring is performed by the orchestrator (see `.integration-staging/182.json`):
 *   - spread `bcDaemonPrinceSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `BcDaemonPrinceDeclarations` to the class with a `declare` block
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond
 * the field constructors. Non-BC actors still get the field (defaults to
 * "not ascended"); the panel and action are gated on
 * `actor._gameSystemId === 'bc'` so the surface is invisible elsewhere.
 */

import type { DaemonPrinceAlignment } from '../../../rules/bc-daemon-prince.ts';

const { NumberField, SchemaField, StringField } = foundry.data.fields;

/** Chaos alignment choices mirrored from {@link DaemonPrinceAlignment}. */
const ALIGNMENT_CHOICES: readonly DaemonPrinceAlignment[] = ['khorne', 'slaanesh', 'nurgle', 'tzeentch', 'unaligned'];

/**
 * The persisted ascension record. `ascendedAt === null` means the
 * character has not ascended; any non-null value means apotheosis has
 * fired and {@link isAscended} returns `true` against the matching
 * non-null record.
 */
export interface BcDaemonPrinceAscensionData {
    /** World-time (or session number) at which apotheosis fired; null = never ascended. */
    ascendedAt: number | null;
    /** Chaos alignment held at the moment of ascension. */
    alignmentAtAscension: DaemonPrinceAlignment;
}

/**
 * Class-level `declare` shape contributed by the BC Daemon Prince schema
 * slot. The orchestrator splices these declarations onto CharacterData so
 * the compiler narrows `actor.system.daemonPrinceAscension.ascendedAt`
 * etc. without casts.
 */
export interface BcDaemonPrinceDeclarations {
    daemonPrinceAscension: BcDaemonPrinceAscensionData;
}

/**
 * Schema-field bundle for the BC Daemon Prince engine. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...bcDaemonPrinceSchemaFields(),
 *     };
 *
 * The wrapping SchemaField keeps `ascendedAt` and `alignmentAtAscension`
 * locked together — a record exists iff `ascendedAt !== null`, and the
 * alignment is then always present alongside it.
 */
export function bcDaemonPrinceSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        daemonPrinceAscension: new SchemaField({
            ascendedAt: new NumberField({
                required: true,
                initial: null,
                nullable: true,
                integer: true,
            }),
            alignmentAtAscension: new StringField({
                required: true,
                blank: false,
                initial: 'unaligned',
                choices: [...ALIGNMENT_CHOICES],
            }),
        }),
    };
}
