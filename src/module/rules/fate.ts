/**
 * @file Fate — the actor's Fate total and current points (#42).
 *
 * Every line models Fate as a total plus a current pool: the schema's
 * `fate.max` is the total (DH2's "Fate threshold"), `fate.value` the points
 * left to spend. In every line, burning Fate lowers the total by 1 for good and
 * drops the current points to the new total if they exceed it. A character may
 * burn Fate even with no points left to spend.
 */

import { nonNegInt } from './_num.ts';

/** The actor's Fate fields. */
export interface FateState {
    max: number;
    value: number;
}

/** The update that burns one point of Fate (a type literal, so it is an `actor.update` payload). */
export type BurnFateUpdate = {
    'system.fate.max': number;
    'system.fate.value': number;
};

/**
 * The Fate total once the retired separate `threshold` field (#63) is folded into it.
 * By the book the threshold IS the total, so the two fields described one
 * value. `max` is the field every Fate path writes (origin Fate, Burn Fate,
 * the vitals pips), so it normally wins. A recorded threshold larger than
 * `max` can only be a total the sheet never raised `max` to (#42 left `max`
 * at 0 when origin Fate was written to a phantom field). So the larger of the
 * two is the character's real Fate total, and nothing recorded is lost.
 */
export function fateTotalWithLegacyThreshold(max: number, threshold: number): number {
    return Math.max(nonNegInt(max), nonNegInt(threshold));
}

/**
 * An origin's contribution to the Fate total (`fate.max`). An origin whose
 * Fate is rolled (`fateFormula`, e.g. a home world with the Emperor's
 * Blessing) contributes the roll; its `fateThreshold` is then only the printed
 * base the formula already encodes. An origin with no formula contributes its
 * `fateThreshold` directly, e.g. the DH2 divination "Do not ask why you serve.
 * Only ask how." (+1 Fate threshold).
 */
export function originFateContribution(
    grants: { fateFormula?: string | undefined; fateThreshold?: number | undefined },
    rolledFate: number | undefined,
): number {
    if (rolledFate !== undefined) return nonNegInt(rolledFate);
    if ((grants.fateFormula ?? '') !== '') return 0;
    return nonNegInt(grants.fateThreshold ?? 0);
}

/** A named source of Fate: an origin path, or a talent / trait / other item. */
export interface FateSource {
    name: string;
    value?: number | undefined;
    /** The owned item's UUID, so the row opens it. */
    uuid?: string | null | undefined;
    /** The compendium document the item came from, which names the row. */
    sourceUuid?: string | null | undefined;
}

/** One row of the Fate breakdown. */
export interface FateBreakdownRow {
    source: string;
    value: number;
    uuid?: string;
    kind: 'origin' | 'item';
}

/**
 * Split the Fate total into rows, one per source that adds Fate (#689). Each row
 * is named after its own source: `nameOf` resolves the compendium document the
 * item came from, falling back to the item's own name. Origins come first, then
 * talents, traits and other items. The base is what the sources do not account
 * for: the starting Fate, less any point burnt since.
 */
export function fateBreakdownRows(
    total: number,
    origins: readonly FateSource[],
    items: readonly FateSource[],
    nameOf: (uuid: string | null | undefined, fallback: string) => string,
): { base: number; rows: FateBreakdownRow[] } {
    const toRow = (source: FateSource, kind: FateBreakdownRow['kind']): FateBreakdownRow | null => {
        const value = source.value ?? 0;
        if (value === 0) return null;
        const row: FateBreakdownRow = { source: nameOf(source.sourceUuid, source.name), value, kind };
        if (typeof source.uuid === 'string' && source.uuid !== '') row.uuid = source.uuid;
        return row;
    };
    const rows = [...origins.map((s) => toRow(s, 'origin')), ...items.map((s) => toRow(s, 'item'))].filter((row): row is FateBreakdownRow => row !== null);
    const base = nonNegInt(total) - rows.reduce((sum, row) => sum + row.value, 0);
    return { base, rows };
}

/**
 * Burn one Fate: the total drops by 1 and the current points are cut to the
 * new total. `null` when there is no Fate left to burn.
 */
export function burnFateUpdate(fate: FateState): BurnFateUpdate | null {
    const max = nonNegInt(fate.max);
    if (max <= 0) return null;
    const newMax = max - 1;
    return { 'system.fate.max': newMax, 'system.fate.value': Math.min(nonNegInt(fate.value), newMax) };
}
