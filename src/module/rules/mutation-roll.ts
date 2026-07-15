/**
 * Mutation roll logic (#117).
 *
 * This module holds NO reproduced rulebook content. The Mutation table
 * (Table 8–16 — mutation names, effect prose, and d100 ranges) lives in the
 * `dh2-core-rolltables` compendium as the "Mutations" RollTable, whose results
 * reference the mutation items in `dh2-core-items-mutations` by UUID. This
 * module loads that table at runtime, resolves each referenced item to a
 * structured {@link MutationEntry}, and maps a d100 roll on the selected track
 * to an entry — the roll/clamp/find plumbing is content-agnostic.
 *
 * The Minor / Major tracks are the two ways the GM samples the same table
 * (core.md §"Mutation"): a Minor roll is confined to the lower, less-severe
 * rows; a Major roll spans the whole table. Which rows are "minor" is authored
 * on the items themselves (`system.category`), so the track's d100 band is
 * derived from the loaded content rather than hardcoded here.
 */

import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { type Rng, clampRoll, findBandBy, rollD100 } from './_dice.ts';

/** Which sampling track the GM rolls on. */
export type MutationTrack = 'minor' | 'major';

/** A resolved row of the Mutations table, projected from its compendium item. */
export interface MutationEntry {
    /** Inclusive d100 `[low, high]` band this mutation occupies. */
    readonly range: readonly [number, number];
    /** UUID of the backing mutation item in `dh2-core-items-mutations`. */
    readonly uuid: string;
    /** Display name (from the item). */
    readonly name: string;
    /** Track membership (item `system.category`; anything but `major` is minor). */
    readonly category: MutationTrack;
    /** Whether the mutation is outwardly visible (item `system.visible`). */
    readonly visible: boolean;
    /** Mechanical effect HTML (item `system.effect`). */
    readonly effect: string;
}

/** Name of the Mutations RollTable in the compendium. */
const MUTATION_TABLE_NAME = 'Mutations';
/** Compendium collection holding the Mutations RollTable (`<package>.<pack>`). */
const MUTATION_TABLE_PACK = 'wh40k-rpg.dh2-core-rolltables';

/** Minimal shape of a Mutations RollTable result this module depends on. */
export interface MutationResult {
    readonly range: readonly [number, number];
    readonly documentUuid: string | null;
    readonly name: string;
}

/**
 * The track's inclusive d100 clamp band, derived from the loaded entries. A
 * `major` roll spans the full table; a `minor` roll stops at the last
 * minor-category row. Both bands start at 1. Empty input yields `[1, 1]`.
 */
export function trackRange(entries: readonly MutationEntry[], track: MutationTrack): { min: number; max: number } {
    const pool = track === 'minor' ? entries.filter((entry) => entry.category === 'minor') : entries;
    const max = pool.reduce((highest, entry) => Math.max(highest, entry.range[1]), 1);
    return { min: 1, max };
}

/** Outcome of a mutation roll: the (clamped) d100 value and the row it hit. */
export interface MutationRollResult {
    readonly track: MutationTrack;
    readonly roll: number;
    readonly mutation: MutationEntry | null;
}

/**
 * Roll a d100 on the given track. The raw roll is clamped into the track's
 * band (so a Minor roll can never land above the minor rows), then matched to
 * the entry whose range contains it. `mutation` is null only if the table has a
 * genuine gap at the clamped value (the complete table has none).
 */
export function rollMutation(entries: readonly MutationEntry[], track: MutationTrack, rng: Rng = Math.random): MutationRollResult {
    const range = trackRange(entries, track);
    const clamped = clampRoll(rollD100(rng), { min: range.min, max: range.max });
    const mutation = findBandBy(entries, clamped, (entry) => entry.range, { clamp: false }) ?? null;
    return { track, roll: clamped, mutation };
}

/** Narrowed projection of a resolved mutation item's flattened system data. */
interface ResolvedMutationItem {
    readonly name: string;
    readonly category: string;
    readonly visible: boolean;
    readonly effect: string;
}

/**
 * Validate the loosely-typed document returned by `fromUuid` into the fields we
 * read. Mutation items carry per-line `{ dh2: … }` authoring containers on disk,
 * but the DataModel flattens them to flat values at construction time (see
 * `ItemDataModel.#flattenLineVariants`), so a runtime-resolved item exposes flat
 * `system.category` / `system.visible` / `system.effect`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns an untyped Foundry Document; its fields are validated defensively below
function toMutationItem(item: unknown): ResolvedMutationItem | null {
    if (typeof item !== 'object' || item === null) return null;
    const rec = item as { name?: string; system?: { category?: string; visible?: boolean; effect?: string } };
    const sys = rec.system;
    return {
        name: typeof rec.name === 'string' ? rec.name : '',
        category: typeof sys?.category === 'string' ? sys.category : 'minor',
        visible: typeof sys?.visible === 'boolean' ? sys.visible : false,
        effect: typeof sys?.effect === 'string' ? sys.effect : '',
    };
}

/**
 * Resolve a table's results into structured entries via an injected item
 * resolver (`fromUuid` in production, a fake in tests). Results without a
 * document reference or whose item won't resolve are dropped. Entries come back
 * sorted ascending by range start.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: resolveItem is fromUuid in production, which returns an untyped Foundry Document (Promise<unknown>)
export async function buildEntries(results: readonly MutationResult[], resolveItem: (uuid: string) => Promise<unknown>): Promise<MutationEntry[]> {
    const resolved = await Promise.all(
        results.map(async (result): Promise<MutationEntry | null> => {
            const uuid = result.documentUuid;
            if (uuid === null || uuid === '') return null;
            const item = toMutationItem(await resolveItem(uuid));
            if (item === null) return null;
            return {
                range: [result.range[0], result.range[1]] as const,
                uuid,
                name: item.name !== '' ? item.name : result.name,
                category: item.category === 'major' ? 'major' : 'minor',
                visible: item.visible,
                effect: item.effect,
            };
        }),
    );
    return resolved.filter((entry): entry is MutationEntry => entry !== null).sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * Load and resolve the Mutations table from the compendium. Returns the sorted
 * entries, or null when the table can't be found (pack missing / not ready) so
 * the caller can surface a warning.
 */
export async function loadMutationEntries(): Promise<MutationEntry[] | null> {
    const table = await RollTableUtils.findTableInCompendiums(MUTATION_TABLE_NAME, MUTATION_TABLE_PACK);
    if (table === null) return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: RollTable#results is Foundry's untyped embedded Collection; the length-2 range / documentUuid / name shape holds at runtime
    const results = Array.from(table.results as unknown as Iterable<MutationResult>);
    return buildEntries(results, async (uuid) => fromUuid(uuid));
}
