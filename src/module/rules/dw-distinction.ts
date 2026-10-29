/**
 * Deathwatch Distinctions, Marks of Distinction, and Advanced Special
 * Abilities (#171 — a Deathwatch supplement).
 *
 * All three are `specialAbility` items told apart by `category`. A
 * Distinction is a GM-built combination of Marks of Distinction; an
 * Advanced Special Ability comes with an Advanced Speciality and inherits
 * its prerequisites. Any of them may carry a minimum Renown rank and a
 * Renown reward; both are content values authored on the compendium item
 * (Direction #7), so this module holds only the content-agnostic shapes
 * and the gate / award / merge arithmetic.
 *
 * The persisted field shapes below are the single source of truth: the
 * `specialAbility` DataModel declares its fields with these types and
 * builds its schema `choices` from these constants.
 */

import { type RenownRank, awardRenown, getRenownRank, renownRankIndex } from './dw-renown.ts';

/** What kind of special ability an item is. `speciality` is the default for every pre-existing item. */
export const SPECIAL_ABILITY_CATEGORIES = ['speciality', 'advanced', 'distinction', 'mark'] as const;
/** {@link SPECIAL_ABILITY_CATEGORIES} as a union. */
export type SpecialAbilityCategory = (typeof SPECIAL_ABILITY_CATEGORIES)[number];

/** Whether `value` is a special-ability category id. */
export function isSpecialAbilityCategory(value: string | null | undefined): value is SpecialAbilityCategory {
    return value != null && (SPECIAL_ABILITY_CATEGORIES as readonly string[]).includes(value);
}

/** Langpack key for a category's display label (`mark` → `WH40K.SpecialAbility.Category.Mark`). */
export function specialAbilityCategoryLabelKey(category: SpecialAbilityCategory): string {
    return `WH40K.SpecialAbility.Category.${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

/**
 * The non-numeric benefit a Mark of Distinction confers. Numeric
 * characteristic changes are not here: they ride the item's existing
 * `modifiers.characteristics` map so the central modifier path applies
 * them with provenance. Blank strings mean "none".
 */
interface SpecialAbilityGrant {
    /** Compendium UUID of a trait the bearer gains. */
    trait: string;
    /** Identifier of an Active Effect to attach to the bearer. */
    activeEffect: string;
}

/** The Distinction / Renown fields a `specialAbility` item persists. */
export interface SpecialAbilityDistinctionFields {
    category: SpecialAbilityCategory;
    /** Minimum Renown rank to gain the ability; `null` when the book prints none. */
    renownRequired: RenownRank | null;
    /** Renown awarded when the ability is conferred; 0 for none. */
    renownReward: number;
    /** Experience-point cost (Marks and Distinctions are bought with XP); 0 when free. */
    cost: number;
    /** Compendium UUIDs of the Marks of Distinction a Distinction combines. */
    marks: string[];
    grant: SpecialAbilityGrant;
}

/** The categories gated by Renown rank and rewarded with Renown. */
const RENOWN_CATEGORIES: ReadonlySet<SpecialAbilityCategory> = new Set<SpecialAbilityCategory>(['advanced', 'distinction', 'mark']);

/** Whether abilities of this category take part in the Renown gate and reward. */
export function isRenownCategory(category: SpecialAbilityCategory): boolean {
    return RENOWN_CATEGORIES.has(category);
}

/** Reason a gain attempt was refused. */
type DistinctionGateFailure = 'rank-too-low';

/** Outcome of the Renown-rank gate. A refusal names the rank that was needed. */
export type DistinctionGateResult = { allowed: true } | { allowed: false; reason: DistinctionGateFailure; requiredRank: RenownRank };

/**
 * Gate check for gaining a special ability. The bearer's Renown rank must
 * be at least the ability's `renownRequired`. A `speciality` ability, or
 * one with no printed requirement, always passes.
 */
export function canGainSpecialAbility(args: {
    ability: Pick<SpecialAbilityDistinctionFields, 'category' | 'renownRequired'>;
    actorRenownRank: RenownRank;
}): DistinctionGateResult {
    const required = args.ability.renownRequired;
    if (required === null || !isRenownCategory(args.ability.category)) return { allowed: true };
    if (renownRankIndex(args.actorRenownRank) < renownRankIndex(required)) {
        return { allowed: false, reason: 'rank-too-low', requiredRank: required };
    }
    return { allowed: true };
}

/** {@link canGainSpecialAbility} from a raw Renown score rather than a resolved rank. */
export function canGainSpecialAbilityFromRenown(args: {
    ability: Pick<SpecialAbilityDistinctionFields, 'category' | 'renownRequired'>;
    actorRenown: number;
}): DistinctionGateResult {
    return canGainSpecialAbility({ ability: args.ability, actorRenownRank: getRenownRank(args.actorRenown) });
}

/**
 * Renown after conferring a special ability. Applies the reward through
 * the canonical `awardRenown` clamp; a `speciality` ability or a zero
 * reward leaves Renown unchanged. `changed` tells the caller whether a
 * write is needed.
 */
export function awardDistinction(args: { ability: Pick<SpecialAbilityDistinctionFields, 'category' | 'renownReward'>; currentRenown: number }): {
    newRenown: number;
    changed: boolean;
} {
    if (!isRenownCategory(args.ability.category) || args.ability.renownReward <= 0) {
        return { newRenown: args.currentRenown, changed: false };
    }
    const newRenown = awardRenown(args.currentRenown, args.ability.renownReward);
    return { newRenown, changed: newRenown !== args.currentRenown };
}

/** The slice of a Mark item that {@link mergeMarkGrants} reads. */
export interface MarkGrantSource {
    grant: SpecialAbilityGrant;
    modifiers: { characteristics: Record<string, number> };
}

/**
 * Merge a set of Marks of Distinction into one aggregated grant payload.
 * Characteristic changes sum; traits and Active Effect ids are collected
 * with duplicates coalesced so two Marks granting the same trait don't
 * compound.
 */
export function mergeMarkGrants(marks: ReadonlyArray<MarkGrantSource>): {
    characteristicDelta: Record<string, number>;
    traits: string[];
    activeEffects: string[];
} {
    const characteristicDelta: Record<string, number> = {};
    const traitsSet = new Set<string>();
    const effectsSet = new Set<string>();

    for (const mark of marks) {
        for (const [key, value] of Object.entries(mark.modifiers.characteristics)) {
            if (!Number.isFinite(value)) continue;
            characteristicDelta[key] = (characteristicDelta[key] ?? 0) + value;
        }
        if (mark.grant.trait !== '') traitsSet.add(mark.grant.trait);
        if (mark.grant.activeEffect !== '') effectsSet.add(mark.grant.activeEffect);
    }

    return {
        characteristicDelta,
        traits: Array.from(traitsSet),
        activeEffects: Array.from(effectsSet),
    };
}
