/**
 * Black Crusade Gifts of the Gods resolver (#180 — core.md Table 9-1
 * "Gifts of the Gods", plus sub-tables 9-2 "Limb Table" and 9-4
 * "Random Creatures").
 *
 * A Gift of the Gods is a `mutation` item whose `category` is
 * {@link GIFT_MUTATION_CATEGORY}. The item's own `effect` is the base
 * effect every recipient gets; its `modifiers` block (ModifiersTemplate,
 * Path A) holds the flat characteristic / skill changes; and its
 * `system.gift` block ({@link GiftData}) holds what is particular to a
 * Gift: the alignment riders, the granted items, the sub-table to roll
 * on, and the dice-valued characteristic changes the recipient rolls
 * once when the Gift is gained.
 *
 * This module is the single source of that `system.gift` shape — the
 * MutationData schema is built from the constants and types declared
 * here — and of the pure resolution logic:
 *
 *   - {@link giftDefFromMutation} adapts an owned mutation item to a
 *     {@link GiftDef}.
 *   - {@link resolveGiftForAlignment} merges the base effect with the
 *     rider matching the Heretic's current Chaos Alignment. An Unaligned
 *     Heretic (or one whose god has no rider) gets the base effect only;
 *     riders never apply twice and never stack across alignments.
 *   - {@link mergeGiftDeltas} sums deltas across every Gift a character
 *     holds.
 *   - {@link pendingGiftRolls} lists the acquisition rolls a Gift still
 *     needs, given the results already stored on the owned item.
 *
 * Per Direction #7 the catalogue itself — names, descriptions, riders,
 * values — lives in compendium `_source/*.json`. No Foundry imports.
 */

import type { ChaosAlignment } from '../config/game-systems/types.ts';

/* -------------------------------------------- */
/*  Vocabulary                                  */
/* -------------------------------------------- */

/** The `mutation.category` value that marks a mutation as a Gift of the Gods. */
export const GIFT_MUTATION_CATEGORY = 'gift';

/** The Ruinous Powers a rider can be keyed to. */
export const GIFT_ALIGNMENTS = ['khorne', 'slaanesh', 'nurgle', 'tzeentch'] as const;
/** A Ruinous Power a rider can be keyed to. */
export type GiftAlignment = (typeof GIFT_ALIGNMENTS)[number];

/** The secondary tables a Gift can send the recipient to; `''` = none. */
export const GIFT_SUB_TABLES = ['', 'limb', 'animal'] as const;
/** A secondary table reference. */
export type GiftSubTable = (typeof GIFT_SUB_TABLES)[number];

/** Whether a rolled characteristic change raises or lowers the characteristic. */
export const GIFT_ROLL_DIRECTIONS = ['gain', 'loss'] as const;
/** The direction of a rolled characteristic change. */
export type GiftRollDirection = (typeof GIFT_ROLL_DIRECTIONS)[number];

/* -------------------------------------------- */
/*  Stored shape (MutationData `system.gift`)   */
/* -------------------------------------------- */

/**
 * Alignment-specific rider. When the holder's alignment matches, the
 * rider composes with the base effect.
 */
export interface GiftRider {
    /** The Ruinous Power that activates this rider. */
    alignment: GiftAlignment;
    /** Rules text of the rider. */
    description: string;
    /** Flat characteristic changes, keyed like `modifiers.characteristics`. */
    characteristics: Record<string, number>;
    /** Flat skill-test modifiers, keyed like `modifiers.skills`. */
    skills: Record<string, number>;
    /** Compendium UUIDs of the traits / talents the rider grants. */
    grants: string[];
    /** Id of an Active Effect embedded on the Gift that the rider applies; `''` = none. */
    activeEffect: string;
}

/**
 * A dice-valued characteristic change the recipient rolls once, when the
 * Gift is gained ("permanently reduce Intelligence by 1d10+5"). The result
 * is stored on the owned item's `modifiers.characteristics`.
 */
export interface GiftCharacteristicRoll {
    /** Characteristic key, as `modifiers.characteristics` keys it. */
    characteristic: string;
    /** Dice formula of the magnitude, e.g. `1d10+5`. */
    formula: string;
    /** Whether the rolled magnitude is added or subtracted. */
    direction: GiftRollDirection;
}

/** The `system.gift` block of a mutation item. Every field defaults to empty. */
export interface GiftData {
    /** Compendium UUIDs of the traits / talents the base effect grants. */
    grants: string[];
    /** Alignment riders. Order is not significant. */
    riders: GiftRider[];
    /** Secondary table the Gift rolls on. */
    subTable: GiftSubTable;
    /** Dice-valued characteristic changes rolled on acquisition. */
    characteristicRolls: GiftCharacteristicRoll[];
}

/* -------------------------------------------- */
/*  Resolution shapes                           */
/* -------------------------------------------- */

/** A Gift as the resolver reads it: identity + base effect + the `system.gift` block. */
export interface GiftDef {
    /** Owned-item id. */
    id: string;
    /** Display name. */
    name: string;
    /** Rules text of the base effect. */
    baseDescription: string;
    /** Flat base characteristic changes (the item's `modifiers.characteristics`). */
    baseCharacteristics: Record<string, number>;
    /** Flat base skill-test modifiers (the item's `modifiers.skills`). */
    baseSkills: Record<string, number>;
    /** Traits / talents the base effect grants. */
    baseGrants: string[];
    /** Alignment riders. */
    riders: GiftRider[];
    /** Secondary table reference. */
    subTable: GiftSubTable;
}

/** A Gift resolved against one alignment. */
export interface ResolvedGift {
    id: string;
    name: string;
    baseDescription: string;
    /** Text of the applied rider; `''` when none applies. */
    riderDescription: string;
    /** Base + rider characteristic changes. */
    characteristicDelta: Record<string, number>;
    /** Base + rider skill-test modifiers. */
    skillDelta: Record<string, number>;
    /** Base grants first, then rider grants (deduplicated). */
    grants: string[];
    /** The applied rider's Active Effect, when it names one. */
    activeEffects: string[];
    /** The alignment whose rider was applied, or `'unaligned'` if none. */
    appliedAlignment: ChaosAlignment;
}

/** The structural slice of an owned mutation item {@link giftDefFromMutation} reads. */
export interface GiftMutationLike {
    id: string | null;
    name: string;
    system: {
        effect: string;
        modifiers: { characteristics: Record<string, number>; skills: Record<string, number> };
        gift: GiftData;
    };
}

/** The `system` of a mutation item that is a Gift of the Gods. */
export type GiftMutationSystem = GiftMutationLike['system'] & { readonly category: typeof GIFT_MUTATION_CATEGORY };

/**
 * Whether an item is a Gift of the Gods: a `mutation` whose category is
 * {@link GIFT_MUTATION_CATEGORY}. The MutationData schema guarantees such an
 * item carries the `gift` block, so the guard narrows `system` to the slice
 * the resolver reads — one narrowing point for data prep, sheet and actions.
 */
export function isGiftItem<T extends { readonly type: string; readonly system: object }>(item: T): item is T & { readonly system: GiftMutationSystem } {
    const { system } = item;
    return item.type === 'mutation' && 'category' in system && system.category === GIFT_MUTATION_CATEGORY && 'gift' in system;
}

/* -------------------------------------------- */
/*  Resolver                                    */
/* -------------------------------------------- */

/** Adapt an owned mutation item to the resolver's {@link GiftDef}. */
export function giftDefFromMutation(item: GiftMutationLike): GiftDef {
    const { effect, modifiers, gift } = item.system;
    return {
        id: item.id ?? '',
        name: item.name,
        baseDescription: effect,
        baseCharacteristics: modifiers.characteristics,
        baseSkills: modifiers.skills,
        baseGrants: gift.grants,
        riders: gift.riders,
        subTable: gift.subTable,
    };
}

/**
 * Merge a Gift's base effect with the rider matching `alignment`, if any.
 * Deltas sum per key; grants concatenate `[base, rider]` with duplicates
 * dropped so a consumer cannot grant the same item twice.
 */
export function resolveGiftForAlignment(gift: GiftDef, alignment: ChaosAlignment): ResolvedGift {
    const rider = alignment === 'unaligned' ? undefined : gift.riders.find((r) => r.alignment === alignment);
    return {
        id: gift.id,
        name: gift.name,
        baseDescription: gift.baseDescription,
        riderDescription: rider?.description ?? '',
        characteristicDelta: mergeGiftDeltas([gift.baseCharacteristics, rider?.characteristics ?? {}]),
        skillDelta: mergeGiftDeltas([gift.baseSkills, rider?.skills ?? {}]),
        grants: dedupe([...gift.baseGrants, ...(rider?.grants ?? [])]),
        activeEffects: dedupe([rider?.activeEffect ?? '']),
        appliedAlignment: rider ? rider.alignment : 'unaligned',
    };
}

/**
 * Sum deltas across many maps (typically every Gift the actor holds,
 * already resolved for their alignment). Absent keys contribute 0,
 * negative values are preserved, non-finite values are ignored.
 */
export function mergeGiftDeltas(deltas: ReadonlyArray<Readonly<Record<string, number>>>): Record<string, number> {
    const merged: Record<string, number> = {};
    for (const delta of deltas) {
        for (const [key, value] of Object.entries(delta)) {
            if (!Number.isFinite(value)) continue;
            merged[key] = (merged[key] ?? 0) + value;
        }
    }
    return merged;
}

/**
 * The acquisition rolls a Gift still needs: every
 * {@link GiftCharacteristicRoll} whose characteristic has no stored result
 * in `rolled` (the owned item's `modifiers.characteristics`) yet.
 */
export function pendingGiftRolls(gift: GiftData, rolled: Readonly<Record<string, number>>): GiftCharacteristicRoll[] {
    return gift.characteristicRolls.filter((roll) => !Object.prototype.hasOwnProperty.call(rolled, roll.characteristic));
}

/** The signed value a rolled magnitude contributes, per its direction. */
export function signedGiftRoll(roll: GiftCharacteristicRoll, magnitude: number): number {
    return roll.direction === 'loss' ? -magnitude : magnitude;
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function dedupe(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value !== ''))];
}
