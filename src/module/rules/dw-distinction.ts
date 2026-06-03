/**
 * Deathwatch Distinctions, Marks of Distinction, and Advanced Special
 * Abilities (#171 — rites.md §"DISTINCTIONS" p. 3046; §"ADVANCED
 * SPECIAL ABILITIES" p. 3404).
 *
 * Pure-rules engine. Distinctions are honors earned on missions or at
 * Renown thresholds; each Distinction carries a Renown reward and, when
 * embodied as a Mark of Distinction, grants a structured benefit
 * (characteristic delta, trait, or active effect id). Advanced Special
 * Abilities are gated by Renown rank and (typically) cost Cohesion to
 * activate during Squad Mode.
 *
 * This module owns the gate checks, the Renown-arithmetic on award, and
 * the merge of multiple Marks into a single grant payload. The caller
 * (character DataModel, distinction prompt, chat card) owns I/O and the
 * Cohesion spend.
 */

import { type RenownRank, awardRenown, renownRankIndex, getRenownRank } from './dw-renown.ts';

/**
 * A Distinction definition — the honor itself. The Mark of Distinction
 * (below) wraps a Distinction with a concrete grant. Many Distinctions
 * are conferred purely as Renown awards without an attached Mark.
 */
export interface DistinctionDef {
    /** Stable identifier (e.g. compendium item id or canonical slug). */
    id: string;
    /** Display name (player-facing). */
    name: string;
    /** Narrative description (player-facing). */
    description: string;
    /**
     * Minimum Renown rank a Battle-Brother must hold to earn this
     * Distinction. Distinctions at higher ranks recognise feats only
     * possible to senior Marines.
     */
    renownRequired: RenownRank;
    /**
     * Renown points awarded when this Distinction is conferred.
     * Non-negative; zero is permitted for purely ceremonial honors.
     */
    renownReward: number;
}

/**
 * The structured benefit a Mark of Distinction confers on its bearer.
 * Each field is independently optional so a Mark can grant a stat
 * bump, a trait, an active-effect hook, or any combination thereof.
 */
interface DistinctionGrant {
    /** Stable identifier matching the parent Mark / Distinction. */
    id: string;
    /** Player-facing description of what the grant does. */
    description: string;
    /**
     * Characteristic deltas keyed by characteristic short code
     * (e.g. `WS`, `BS`, `S`, `T`). Positive values are bonuses; negative
     * deltas are permitted for Marks that carry a cost.
     */
    characteristicDelta?: Record<string, number>;
    /** Compendium UUID or canonical slug for a granted trait. */
    trait?: string;
    /** Identifier of an active effect to attach on award. */
    activeEffect?: string;
}

/**
 * A Mark of Distinction — a Distinction that has been crystallised into
 * a permanent benefit on the Battle-Brother. The `grant` payload is
 * what tooling reads to apply the Mark's mechanical effect.
 */
export interface MarkOfDistinction {
    id: string;
    name: string;
    description: string;
    grant: DistinctionGrant;
}

/**
 * An Advanced Special Ability — unlocked at a given Renown rank, usable
 * during play (typically in Squad Mode) by spending Cohesion.
 *
 * `cohesionCost` is optional: a small number of Advanced abilities are
 * passive and trigger off Renown rank alone (`cohesionCost === undefined`
 * marks those). When set, the activation gate enforces it.
 */
export interface AdvancedSpecialAbility {
    id: string;
    name: string;
    description: string;
    renownRequired: RenownRank;
    cohesionCost?: number;
}

/** Reason an earn / activation attempt was refused. */
export type DistinctionGateFailure = 'rank-too-low';
export type AdvancedAbilityGateFailure = 'rank-too-low' | 'insufficient-cohesion';

/**
 * Gate check for earning a Distinction. The Battle-Brother's current
 * Renown rank must be ≥ the Distinction's `renownRequired` rank.
 */
export function canEarnDistinction(args: {
    distinction: Pick<DistinctionDef, 'renownRequired'>;
    actorRenownRank: RenownRank;
}): { allowed: true } | { allowed: false; reason: DistinctionGateFailure } {
    if (renownRankIndex(args.actorRenownRank) < renownRankIndex(args.distinction.renownRequired)) {
        return { allowed: false, reason: 'rank-too-low' };
    }
    return { allowed: true };
}

/**
 * Award a Distinction. Applies the Distinction's Renown reward via the
 * canonical `awardRenown` helper (which clamps the floor at 0 and
 * leaves the ceiling uncapped) and returns the new Renown total along
 * with the Distinction id for log / chat-card use.
 */
export function awardDistinction(args: { distinction: Pick<DistinctionDef, 'id' | 'renownReward'>; currentRenown: number }): {
    newRenown: number;
    distinctionId: string;
} {
    return {
        newRenown: awardRenown(args.currentRenown, args.distinction.renownReward),
        distinctionId: args.distinction.id,
    };
}

/**
 * Gate check for activating an Advanced Special Ability. Rank is
 * checked first (it is the structural gate); cohesion only after.
 * If `cohesionCost` is undefined the Cohesion check is skipped — the
 * ability is passive or free-to-trigger by rank alone.
 */
export function canUseAdvancedAbility(args: {
    ability: Pick<AdvancedSpecialAbility, 'renownRequired' | 'cohesionCost'>;
    actorRenownRank: RenownRank;
    currentCohesion: number;
}): { allowed: true } | { allowed: false; reason: AdvancedAbilityGateFailure } {
    if (renownRankIndex(args.actorRenownRank) < renownRankIndex(args.ability.renownRequired)) {
        return { allowed: false, reason: 'rank-too-low' };
    }
    const cost = args.ability.cohesionCost;
    if (cost !== undefined && cost > 0) {
        const have = Number.isFinite(args.currentCohesion) ? args.currentCohesion : 0;
        if (have < cost) {
            return { allowed: false, reason: 'insufficient-cohesion' };
        }
    }
    return { allowed: true };
}

/**
 * Merge a set of Marks of Distinction into a single aggregated grant
 * payload. Characteristic deltas sum; traits and active-effect ids are
 * collected without de-duplication when entries differ, but identical
 * ids are coalesced so multiple Marks granting the same trait don't
 * compound.
 */
export function mergeMarkGrants(marks: ReadonlyArray<MarkOfDistinction>): {
    characteristicDelta: Record<string, number>;
    traits: string[];
    activeEffects: string[];
} {
    const characteristicDelta: Record<string, number> = {};
    const traitsSet = new Set<string>();
    const effectsSet = new Set<string>();

    for (const mark of marks) {
        const grant = mark.grant;
        const deltas = grant.characteristicDelta;
        if (deltas !== undefined) {
            for (const key of Object.keys(deltas)) {
                const value = deltas[key];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: deltas[key] can be undefined at runtime despite Record<string, number> typing
                if (value === undefined || !Number.isFinite(value)) continue;
                const prior = characteristicDelta[key] ?? 0;
                characteristicDelta[key] = prior + value;
            }
        }
        if (grant.trait !== undefined && grant.trait.length > 0) {
            traitsSet.add(grant.trait);
        }
        if (grant.activeEffect !== undefined && grant.activeEffect.length > 0) {
            effectsSet.add(grant.activeEffect);
        }
    }

    return {
        characteristicDelta,
        traits: Array.from(traitsSet),
        activeEffects: Array.from(effectsSet),
    };
}

/**
 * Convenience: resolve the actor's rank from a raw Renown value before
 * gating a Distinction. Sheets that already track the rank should call
 * `canEarnDistinction` directly with the cached rank.
 */
export function canEarnDistinctionFromRenown(args: {
    distinction: Pick<DistinctionDef, 'renownRequired'>;
    actorRenown: number;
}): { allowed: true } | { allowed: false; reason: DistinctionGateFailure } {
    return canEarnDistinction({
        distinction: args.distinction,
        actorRenownRank: getRenownRank(args.actorRenown),
    });
}
