/**
 * Black Crusade Gifts of the Gods resolver (#180 — core.md Table 9-1
 * "Gifts of the Gods", :13581, plus sub-tables 9-2 "Additional Limb"
 * and 9-4 "Animal").
 *
 * Pure-rules engine over a structural representation of a Gift entry.
 * Per Direction #7 of CLAUDE.md, the actual catalogue of gifts — names,
 * descriptions, characteristic deltas, alignment-specific riders — is
 * authored in compendium `_source/*.json` documents. This module owns
 * only the data shape and the resolution logic:
 *
 *   - {@link GiftDef} declares a single gift's base effect plus its 4
 *     alignment-keyed riders (Khorne/Slaanesh/Nurgle/Tzeentch). A gift
 *     may optionally reference a sub-table (`'limb' | 'animal'`) so the
 *     UI can drive a secondary roll without this module knowing the
 *     contents of those tables.
 *   - {@link resolveGiftForAlignment} merges the base effect with the
 *     rider matching the Heretic's current Chaos Alignment. When the
 *     Heretic is Unaligned (or no rider matches their alignment), only
 *     the base effect applies — riders never apply twice and never
 *     stack across alignments.
 *   - {@link mergeGiftDeltas} sums characteristic deltas across all the
 *     gifts a character holds, so the actor data-prep step can fold the
 *     aggregate into derived characteristics.
 *
 * No DataModel coupling, no actor lookups, no Foundry imports. The
 * caller (sheet, chat card, gift-grant dialog) owns I/O.
 */

import type { ChaosAlignment } from '../config/game-systems/types.ts';

/* -------------------------------------------- */
/*  Public shapes                               */
/* -------------------------------------------- */

/**
 * Alignment-specific rider on a {@link GiftDef}. Each gift in Table 9-1
 * carries up to one rider per Ruinous Power. When the holder's alignment
 * matches this rider's `alignment`, the rider's deltas, trait, and
 * Active Effect compose with the gift's base entries.
 */
export interface GiftRider {
    /** The Chaos alignment that activates this rider. */
    alignment: ChaosAlignment;
    /** Narrative description of the rider's effect. */
    description: string;
    /**
     * Optional characteristic delta map. Keys are characteristic
     * identifiers (e.g. `'ws'`, `'bs'`, `'s'`); values are signed
     * integers (may be negative).
     */
    characteristicDelta?: Record<string, number>;
    /** Optional trait identifier granted by the rider. */
    trait?: string;
    /** Optional Active Effect identifier applied by the rider. */
    activeEffect?: string;
}

/**
 * Structural definition of a single Gift of the Gods entry. The
 * content of this object is authored in the compendium; consumers in
 * `src/` must not hardcode specific gift names or numeric values.
 */
export interface GiftDef {
    /** Stable identifier (typically the compendium document id). */
    id: string;
    /** Display name; resolved through `uuidNameCache` at render time. */
    name: string;
    /** Narrative description of the base effect (applies to all alignments). */
    baseDescription: string;
    /** Optional base characteristic delta map. */
    baseCharacteristicDelta?: Record<string, number>;
    /** Optional trait identifier granted by the base effect. */
    baseTrait?: string;
    /** Optional Active Effect identifier applied by the base effect. */
    baseActiveEffect?: string;
    /** Riders keyed by alignment. Order is not significant. */
    riders: GiftRider[];
    /** Optional sub-table reference for secondary rolls. */
    subTableId?: 'limb' | 'animal';
}

/**
 * Result of resolving a {@link GiftDef} against a specific alignment.
 * The merged characteristic delta, traits, and Active Effects reflect
 * base + matching rider; if no rider matches, only the base applies.
 */
export interface ResolvedGift {
    /** Gift identifier, copied through from the input. */
    id: string;
    /** Base description, copied through from the input. */
    baseDescription: string;
    /** Sum of base + rider characteristic deltas. Always a real object. */
    characteristicDelta: Record<string, number>;
    /** Base trait first, then rider trait (deduplicated). */
    traits: string[];
    /** Base Active Effect first, then rider Active Effect (deduplicated). */
    activeEffects: string[];
    /** The alignment whose rider was applied (or `'unaligned'` if none). */
    appliedAlignment: ChaosAlignment;
}

/* -------------------------------------------- */
/*  Resolver                                    */
/* -------------------------------------------- */

/**
 * Merge a gift's base effect with the rider matching the given
 * alignment, if any. When `alignment` is `'unaligned'` or no rider
 * matches, the result is the base effect alone with
 * {@link ResolvedGift.appliedAlignment} set to `'unaligned'`.
 *
 * Characteristic deltas are summed per key (rider value adds to base).
 * Traits and Active Effects are concatenated in `[base, rider]` order
 * with empties dropped; duplicates between base and rider are removed
 * so the consumer cannot double-apply the same trait.
 */
export function resolveGiftForAlignment(gift: GiftDef, alignment: ChaosAlignment): ResolvedGift {
    const matchingRider = alignment === 'unaligned' ? undefined : gift.riders.find((r) => r.alignment === alignment);

    const characteristicDelta = sumDeltas(gift.baseCharacteristicDelta, matchingRider?.characteristicDelta);

    const traits = dedupe([gift.baseTrait, matchingRider?.trait]);
    const activeEffects = dedupe([gift.baseActiveEffect, matchingRider?.activeEffect]);

    return {
        id: gift.id,
        baseDescription: gift.baseDescription,
        characteristicDelta,
        traits,
        activeEffects,
        appliedAlignment: matchingRider ? matchingRider.alignment : 'unaligned',
    };
}

/**
 * Sum characteristic deltas across many gifts (typically the full set
 * the actor currently holds, already resolved against their current
 * alignment). Keys absent from a given map contribute 0; negative
 * deltas are preserved.
 *
 * An empty input array yields an empty object.
 */
export function mergeGiftDeltas(deltas: ReadonlyArray<Record<string, number>>): Record<string, number> {
    const merged: Record<string, number> = {};
    for (const delta of deltas) {
        for (const [key, value] of Object.entries(delta)) {
            if (!Number.isFinite(value)) continue;
            const prior = merged[key] ?? 0;
            merged[key] = prior + value;
        }
    }
    return merged;
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sumDeltas(base: Record<string, number> | undefined, rider: Record<string, number> | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    if (base) {
        for (const [key, value] of Object.entries(base)) {
            if (!Number.isFinite(value)) continue;
            out[key] = (out[key] ?? 0) + value;
        }
    }
    if (rider) {
        for (const [key, value] of Object.entries(rider)) {
            if (!Number.isFinite(value)) continue;
            out[key] = (out[key] ?? 0) + value;
        }
    }
    return out;
}

function dedupe(values: ReadonlyArray<string | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        if (value === undefined) continue;
        if (value === '') continue;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}
