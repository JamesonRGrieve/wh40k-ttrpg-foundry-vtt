/**
 * @file Situational-modifier rows that carry their own use limit and failure
 * consequence (#101).
 *
 * Some situational rows are more than a flat bonus. A talent can grant +20 "once
 * per round", and failing the boosted test badly sends the character to a
 * critical table. Push the Limit (DH2 Enemies Without p. 63) is the first case:
 * +20 Operate (or Survival on a living steed), and failing by 4+ degrees means
 * rolling 1d5 on the Motive Systems (or Impact – Leg) critical table.
 *
 * Every number and table is content, authored on the row in the compendium
 * (`oncePerRound`, `failureConsequence`). This module only reads that data, so a
 * talent that prints a different limit or table needs no code.
 *
 * Pure: no Foundry globals, no document reads.
 */

import { type CombatRoundStamp, isSameRound, readCombatRoundStamp } from './counter-attack.ts';

/** The actor flag holding the round each once-per-round row was last used in. */
export const SITUATIONAL_ROUND_USES_FLAG = 'situationalRoundUses';

/** What failing a boosted test by enough degrees costs: a roll on a critical table. */
export interface SituationalFailureConsequence {
    /** The failure margin, in degrees, at which the consequence fires. */
    readonly minDof: number;
    /** The RollTable to roll on (Compendium UUID). */
    readonly tableUuid: string;
    /** The dice to roll on it (`1d5`); empty means the table's own formula. */
    readonly formula: string;
}

/** A situational row as the limit helpers read it. */
interface LimitedSituationalRow {
    readonly key: string;
    readonly itemId?: string | undefined;
    readonly oncePerRound?: boolean | undefined;
}

/** A situational row as the actor hands it to the roll dialog: the authored row plus its owning item. */
export interface CollectedSituationalModifier {
    key: string;
    value: number;
    condition: string;
    icon: string;
    /** The owning item's name: the row's provenance. */
    source: string;
    /** The owning item's document type (groups gear chips apart, #480). */
    sourceType: string;
    itemId: string;
    appliesToVariant?: string;
    oncePerRound?: boolean;
    failureConsequence?: SituationalFailureConsequence;
}

/** The `failureConsequence` slot to spread onto a collected row: present only when there is one. */
export function failureConsequenceField(consequence: SituationalFailureConsequence | null): { failureConsequence?: SituationalFailureConsequence } {
    return consequence === null ? {} : { failureConsequence: consequence };
}

/** The round-use flag: each row's use key → the round it was last used in. */
type SituationalRoundUses = Readonly<Record<string, CombatRoundStamp>>;

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags and authored pack data are untyped JSON; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * The flag key a row's use is stamped under: its owning item and its row key.
 * Anything outside `[A-Za-z0-9_-]` becomes `_`, so a dotted skill key cannot be
 * read as a nested path when the flag is written.
 */
export function roundUseKey(row: LimitedSituationalRow): string {
    return `${row.itemId ?? ''}_${row.key}`.replace(/[^\w-]/g, '_');
}

/**
 * The round-use flag read back from the actor, keeping only well-formed stamps.
 * @param {unknown} flag  The stored flag.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag
export function readRoundUses(flag: unknown): Record<string, CombatRoundStamp> {
    const out: Record<string, CombatRoundStamp> = {};
    if (!isRecord(flag)) return out;
    for (const [key, value] of Object.entries(flag)) {
        const stamp = readCombatRoundStamp(value);
        if (stamp !== null) out[key] = stamp;
    }
    return out;
}

/**
 * Whether a once-per-round row has already been used this combat round. Out of
 * combat (`now` null) a round limit never binds.
 */
export function isRowSpent(row: LimitedSituationalRow, uses: SituationalRoundUses, now: CombatRoundStamp | null): boolean {
    if (row.oncePerRound !== true || now === null) return false;
    return isSameRound(uses[roundUseKey(row)] ?? null, now);
}

/**
 * The flag after the given rows were used in round `now`: each once-per-round row
 * is stamped, every other row is ignored. Returns null when nothing needs writing
 * (out of combat, or no once-per-round row among them).
 */
export function stampRoundUses(
    uses: SituationalRoundUses,
    rows: readonly LimitedSituationalRow[],
    now: CombatRoundStamp | null,
): Record<string, CombatRoundStamp> | null {
    if (now === null) return null;
    const limited = rows.filter((row) => row.oncePerRound === true);
    if (limited.length === 0) return null;
    const next: Record<string, CombatRoundStamp> = { ...uses };
    for (const row of limited) next[roundUseKey(row)] = now;
    return next;
}

/**
 * A row's failure consequence when it is a real one, else null. The schema
 * defaults an unauthored block to zeros and blanks. A threshold below 1 degree
 * would fire on every failure, and a consequence with no table names nothing to
 * roll, so both read as "no consequence".
 * @param {SituationalFailureConsequence | null | undefined} consequence  The row's `failureConsequence` field.
 */
export function activeFailureConsequence(consequence: SituationalFailureConsequence | null | undefined): SituationalFailureConsequence | null {
    if (consequence === null || consequence === undefined) return null;
    if (!Number.isFinite(consequence.minDof) || consequence.minDof < 1 || consequence.tableUuid === '') return null;
    return consequence;
}

/** Whether a resolved test triggers the consequence: a failure by at least `minDof` degrees. */
export function failureConsequenceFires(consequence: SituationalFailureConsequence, outcome: { readonly success: boolean; readonly dof: number }): boolean {
    return !outcome.success && outcome.dof >= consequence.minDof;
}
