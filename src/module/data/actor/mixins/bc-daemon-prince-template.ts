/**
 * Black Crusade apotheosis DataModel mixin (#182 — BC Core p267).
 *
 * Persists the record of a champion claimed by the Ruinous Powers at 100
 * Corruption, which the pure resolver in `src/module/rules/bc-daemon-prince.ts`
 * reads back:
 *
 *   - `daemonPrinceAscension`        — `SchemaField` slot whose presence
 *                                       (non-null `ascendedAt`) means the
 *                                       champion has been claimed and has
 *                                       left play.
 *     - `ascendedAt`                 — World time of the claim. `null` =
 *                                       never claimed.
 *     - `alignmentAtAscension`       — The Chaos alignment held at the
 *                                       moment of the claim.
 *     - `outcome`                    — `daemonPrince` (Infamy met the GM's
 *                                       threshold) or `chaosSpawn`.
 *
 * Wiring: `bcDaemonPrinceSchemaFields()` is spread into
 * `CharacterData.defineSchema()` and `BcDaemonPrinceDeclarations` is applied
 * to the class with a `declare` block.
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond the
 * field constructors. Non-BC actors still get the field (defaults to "not
 * claimed"); the panel and action are gated on `actor._gameSystemId === 'bc'`
 * so the surface is invisible elsewhere.
 */

import { APOTHEOSIS_OUTCOMES, type ApotheosisOutcome, type DaemonPrinceAlignment } from '../../../rules/bc-daemon-prince.ts';

const { NumberField, SchemaField, StringField } = foundry.data.fields;

/** Chaos alignment choices mirrored from {@link DaemonPrinceAlignment}. */
const ALIGNMENT_CHOICES: readonly DaemonPrinceAlignment[] = ['khorne', 'slaanesh', 'nurgle', 'tzeentch', 'unaligned'];

/**
 * The persisted apotheosis record. `ascendedAt === null` means the champion
 * has not been claimed; any non-null value means the claim has fired.
 */
interface BcDaemonPrinceAscensionData {
    /** World-time at which the champion was claimed; null = never claimed. */
    ascendedAt: number | null;
    /** Chaos alignment held at the moment of the claim. */
    alignmentAtAscension: DaemonPrinceAlignment;
    /** The fate the champion met. */
    outcome: ApotheosisOutcome;
}

/**
 * Class-level `declare` shape contributed by the BC apotheosis schema slot,
 * so the compiler narrows `actor.system.daemonPrinceAscension.ascendedAt`
 * etc. without casts.
 */
export interface BcDaemonPrinceDeclarations {
    daemonPrinceAscension: BcDaemonPrinceAscensionData;
}

/**
 * Schema-field bundle for the BC apotheosis record. Spread into a DataModel's
 * `defineSchema()` return value. The wrapping SchemaField keeps the record's
 * fields locked together — a record exists iff `ascendedAt !== null`.
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
            outcome: new StringField({
                required: true,
                blank: false,
                initial: 'daemonPrince',
                choices: [...APOTHEOSIS_OUTCOMES],
            }),
        }),
    };
}
