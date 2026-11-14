/**
 * One index request per compendium pack on `ready` (#706).
 *
 * Several readers walk the packs while the system gets ready: the UUID name
 * cache (every pack), the condition catalog, and the skill, weapon-quality and
 * career indexes. Foundry's `CompendiumCollection#getIndex` refetches a pack's
 * whole index whenever it is asked for a field it has not indexed, and it does
 * not share a request that is still in flight. Readers asking for different
 * fields, or asking at the same time, so fetched one pack two or three times.
 *
 * `readPackIndex` asks for every field any of those readers needs from that
 * pack, chosen by the pack's declared category, and hands concurrent callers the
 * same request. Each reader then reads its own fields from the shared rows.
 *
 * Index rows are the stored source, not a constructed document: per-line
 * containers and unset fields arrive as authored, so readers normalise them.
 */

import { packLineFlags, type PackMetadataLike } from './line-packs.ts';

/**
 * Asked of every pack: the UUID name cache reads `name` and `type` (Foundry adds
 * `img` itself), and identifier lookups (`compendium-query.ts`, run while origins
 * are reapplied on `ready`) read `system.identifier`. Asking for it up front lets
 * those lookups reuse the index instead of refetching every pack with one more
 * field.
 */
const BASE_INDEX_FIELDS: readonly string[] = ['name', 'type', 'system.identifier'];

/**
 * A skill's test variants and canonical specialisations (`rules/skill-pack-index.ts`),
 * and what its tooltip shows (`applications/components/wh40k-tooltip.ts`).
 */
export const SKILL_INDEX_FIELDS: readonly string[] = [
    'system.identifier',
    'system.variants',
    'system.specializations',
    'system.descriptor',
    'system.uses',
    'system.useTime',
    'system.isBasic',
    'system.aptitudes',
];

/** A weapon quality's mechanics, or the canonical doc it borrows them from (`rules/weapon-quality-payloads.ts`). */
export const WEAPON_QUALITY_INDEX_FIELDS: readonly string[] = ['system.identifier', 'system.mechanics', 'system.mechanicsRef'];

/** A career's advancement table (`config/advancements/career-advancement-cache.ts`). */
export const CAREER_INDEX_FIELDS: readonly string[] = ['system.identifier', 'system.careerAdvancement'];

/** What the condition catalog needs beyond Foundry's defaults (`rules/condition-registry.ts`). */
export const CONDITION_INDEX_FIELDS: readonly string[] = [
    'system.identifier',
    'system.nature',
    'system.modifiers',
    'system.targeted',
    'system.helplessTarget',
    'system.actionLimit',
    'system.autoFail',
    'system.tick',
    'system.removal',
    'system.source',
    'system.visual',
];

/**
 * Extra fields by pack category. Only the packs a reader actually reads carry
 * its fields, so the ~800 packs the name cache walks are not asked for
 * `system.modifiers` and the like.
 */
const FIELDS_BY_CATEGORY: ReadonlyMap<string, readonly string[]> = new Map([
    ['skills', SKILL_INDEX_FIELDS],
    ['weapon-qualities', WEAPON_QUALITY_INDEX_FIELDS],
    ['origins-careers', CAREER_INDEX_FIELDS],
    ['conditions', CONDITION_INDEX_FIELDS],
]);

/** The index fields `readPackIndex` requests for a pack: the base set plus its category's. */
export function packIndexFields(metadata: PackMetadataLike): string[] {
    const category = packLineFlags(metadata)?.category;
    const extra = category === undefined ? [] : FIELDS_BY_CATEGORY.get(category) ?? [];
    return [...new Set([...BASE_INDEX_FIELDS, ...extra])];
}

/** Whether `field` is `other` or lies under it (`system.modifiers.armourPoints` under `system.modifiers`). Pure. */
function isUnder(field: string, other: string): boolean {
    return field === other || field.startsWith(`${other}.`);
}

/**
 * The fields one index request needs to carry both `shared` and `fields`. A field
 * that another one in the list already contains is dropped: the server writes
 * each field into its projection in turn, and writing a child path into a parent
 * it already copied whole throws on any document whose parent value is not an
 * object, failing the pack's whole index. Pure.
 */
export function mergeIndexFields(shared: readonly string[], fields: readonly string[]): string[] {
    const all = [...new Set([...shared, ...fields])];
    return all.filter((field) => !all.some((other) => other !== field && isUnder(field, other)));
}

/** Whether `shared` already carries every one of `fields`, itself or through a parent field. Pure. */
export function indexFieldsCover(shared: readonly string[], fields: readonly string[]): boolean {
    return fields.every((field) => shared.some((other) => isUnder(field, other)));
}

/** The part of a compendium pack `readPackIndex` reads. */
export interface IndexablePack<E extends object> {
    readonly metadata: PackMetadataLike;
    getIndex: (options: { fields: string[] }) => Promise<Iterable<E>>;
}

/** Index requests still in flight, keyed by pack, so concurrent readers share one. */
const inFlight = new WeakMap<object, Promise<Iterable<object>>>();

/**
 * A pack's index with every field the `ready` readers need from it. Callers that
 * ask while a request is in flight share it. Once it settles, a later call goes
 * back to `getIndex`, which returns Foundry's cached index when the fields
 * already indexed cover these.
 */
export async function readPackIndex<E extends object>(pack: IndexablePack<E>): Promise<Iterable<E>> {
    const pending = inFlight.get(pack) as Promise<Iterable<E>> | undefined;
    if (pending !== undefined) return pending;
    const request = pack.getIndex({ fields: packIndexFields(pack.metadata) });
    inFlight.set(pack, request);
    try {
        return await request;
    } finally {
        inFlight.delete(pack);
    }
}
