/**
 * Arrive-loaded magazines (#574).
 *
 * The compendium join treats `clip.value` as instance state: whatever the actor
 * stored wins, even the schema initial 0, so a magazine the actor emptied stays
 * empty. A lean compendium weapon, though, never stored a round count, so it
 * read as "fired empty" from the moment it landed on an actor. The fix is at the
 * point of creation, not in the join: a ranged weapon created on an actor stores
 * a full magazine. Its clip size comes from its own data when that carries one,
 * otherwise from its compendium source (a lean stub's `clip.max` is the schema
 * initial until the join runs).
 *
 * Content-agnostic: the only rule here is "an empty magazine with a positive
 * clip size is loaded to that size"; every clip size is read from data.
 */

import { isPlainObject } from './item-variant-utils.ts';

/** Resolves a compendium source UUID to that weapon's clip size, or null when it has none. */
export type ClipMaxResolver = (compendiumSource: string) => Promise<number | null>;

/** A weapon as the loader reads it, independent of whether it is raw source or a live document. */
export interface LoadableWeapon {
    type: string;
    clipValue: number;
    clipMax: number;
    /** Segments of special/mixed ammo; a loaded magazine already defines the round count. */
    magazineSegments: number;
    compendiumSource: string | null;
    /**
     * The payload states its own round count and is not a compendium copy: an
     * authored weapon's explicit `clip.value` (an empty one included) is kept.
     * A compendium copy's count is the canonical item's, not a choice, so it
     * never counts as authored.
     */
    clipValueAuthored: boolean;
}

/**
 * The round count to store, or null when the weapon needs no loading: it is not
 * a weapon, already holds rounds or a magazine, or has no positive clip size.
 */
export function magazineToLoad(weapon: Omit<LoadableWeapon, 'compendiumSource' | 'clipValueAuthored'>, resolvedMax: number | null): number | null {
    if (weapon.type !== 'weapon') return null;
    if (weapon.clipValue > 0 || weapon.magazineSegments > 0) return null;
    if (resolvedMax === null || resolvedMax <= 0) return null;
    return resolvedMax;
}

/** Does this weapon need its clip size looked up before it can be judged? */
function needsLoading(weapon: LoadableWeapon): boolean {
    return weapon.type === 'weapon' && !weapon.clipValueAuthored && weapon.clipValue <= 0 && weapon.magazineSegments === 0;
}

/**
 * The full-magazine round count for one weapon, resolving its clip size from the
 * compendium only when its own data carries none. Null when nothing changes.
 */
export async function fullMagazineFor(weapon: LoadableWeapon, resolveMax: ClipMaxResolver): Promise<number | null> {
    if (!needsLoading(weapon)) return null;
    if (weapon.clipMax > 0) return magazineToLoad(weapon, weapon.clipMax);
    if (weapon.compendiumSource === null) return null;
    return magazineToLoad(weapon, await resolveMax(weapon.compendiumSource));
}

/**
 * The production {@link ClipMaxResolver}: the prepared clip size of the weapon a
 * compendium UUID names. Null when the UUID does not resolve to an Item, or the
 * lookup fails — a weapon whose size cannot be read is simply left as it is.
 */
export async function canonicalClipMax(compendiumSource: string): Promise<number | null> {
    try {
        const doc = await fromUuid(compendiumSource);
        if (doc?.documentName !== 'Item') return null;
        // Only weapons carry a clip; the guard reads it off whichever Item type resolved.
        const system = doc.system;
        const clip = isPlainObject(system) && isPlainObject(system['clip']) ? system['clip'] : null;
        const max = numberAt(clip, 'max');
        return max > 0 ? max : null;
    } catch (err) {
        console.warn(`WH40K | magazine load: could not resolve ${compendiumSource}`, err);
        return null;
    }
}

function numberAt(container: object | null, key: string): number {
    const value = isPlainObject(container) ? container[key] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Read a raw item create/source payload (the untyped Foundry `Item` data bag) as
 * a {@link LoadableWeapon}. A field the payload omits reads as the schema initial.
 */
export function loadableFromSource(source: object): LoadableWeapon {
    const raw = isPlainObject(source) ? source : {};
    const system = isPlainObject(raw['system']) ? raw['system'] : null;
    const clip = system !== null && isPlainObject(system['clip']) ? system['clip'] : null;
    const magazine = clip?.['magazine'];
    const stats = isPlainObject(raw['_stats']) ? raw['_stats'] : null;
    const linkedSource = stats?.['compendiumSource'];
    const compendiumSource = typeof linkedSource === 'string' && linkedSource !== '' ? linkedSource : null;
    return {
        type: typeof raw['type'] === 'string' ? raw['type'] : '',
        clipValue: numberAt(clip, 'value'),
        clipMax: numberAt(clip, 'max'),
        magazineSegments: Array.isArray(magazine) ? magazine.length : 0,
        compendiumSource,
        clipValueAuthored: compendiumSource === null && typeof clip?.['value'] === 'number',
    };
}

/**
 * A copy of a raw item payload with its magazine loaded, or the payload itself
 * when it needs no loading. Never mutates the input.
 */
export async function withFullMagazine<T extends object>(raw: T, resolveMax: ClipMaxResolver): Promise<T> {
    if (!isPlainObject(raw)) return raw;
    const rounds = await fullMagazineFor(loadableFromSource(raw), resolveMax);
    if (rounds === null) return raw;
    const system = isPlainObject(raw['system']) ? raw['system'] : {};
    const clip = isPlainObject(system['clip']) ? system['clip'] : {};
    return { ...raw, system: { ...system, clip: { ...clip, value: rounds } } };
}
