/**
 * Deathwatch Squad Mode / Solo Mode RAW resolver (#163 — core.md
 * §"SQUAD MODE AND SOLO MODE" p.9434, §"SOLO MODE ABILITIES" p.9517,
 * §"SQUAD MODE ABILITIES" p.9676, Table 7-9 Support Range).
 *
 * Pure functions over a Battle-Brother's combat-mode state. The caller
 * (character DataModel, sheet action handler, chat card) owns I/O,
 * actor lookups, and Cohesion-pool mutation; this module owns the mode
 * transitions, Support-Range table lookups, and ability-activation
 * gating.
 *
 * Canonical rules referenced here:
 *   - Each Battle-Brother is either in Solo Mode or Squad Mode at any
 *     time. The default at scene start is Solo Mode.
 *   - Entering Squad Mode: a Battle-Brother may either spend a Full
 *     Action OR pass a Cohesion Challenge to switch from Solo to Squad.
 *   - Support Range (Table 7-9): the radius at which a Battle-Brother
 *     remains "in support" of their squadmates, by Renown rank. RAW
 *     gives BOTH a visual and a vocal range (the same value at every
 *     rank — see footnote on Table 7-9 — but kept as separate fields
 *     so future per-system divergence stays opt-in). Support is
 *     maintained when EITHER channel is available within range, not
 *     both — per the table footnote.
 *   - Squad-mode abilities cost Cohesion to activate; abilities marked
 *     Sustained continue to apply on subsequent turns without further
 *     cost as long as the activator remains in Squad Mode.
 *
 * Out of scope this round (compendium content, sheet wiring, chat
 * partials): the actual catalogue of Codex Attack Patterns, Defensive
 * Stances, and chapter-specific abilities; the sheet button that
 * triggers `enterSquadMode`; the DataModel slot holding `currentMode`.
 */

import { nonNegDistance, nonNegInt } from './_num.ts';
import type { RenownRank } from './dw-renown';

/** Combat-mode state for a Deathwatch Battle-Brother. */
export type DwMode = 'solo' | 'squad';

/** A pair of Support-Range distances (meters) for the visual and vocal channels. */
export interface SupportRangeTier {
    /** Visual support range in meters (line-of-sight to a squadmate). */
    visual: number;
    /** Vocal support range in meters (voxnet or unaided shout). */
    vocal: number;
}

/**
 * TABLE 7-9 — Support Range by Renown Rank.
 *
 * RAW gives a single radius per rank; the visual / vocal split exists
 * so future per-system or per-chapter divergence (e.g. silence pacts,
 * vox-jammers) can target one channel without rewriting the table.
 */
export const SUPPORT_RANGE_BY_RANK: Record<RenownRank, SupportRangeTier> = {
    initiated: { visual: 30, vocal: 30 },
    respected: { visual: 60, vocal: 60 },
    distinguished: { visual: 60, vocal: 60 },
    famed: { visual: 120, vocal: 120 },
    hero: { visual: 120, vocal: 120 },
};

/** The mode every Battle-Brother starts in at scene start. */
export const DEFAULT_DW_MODE: DwMode = 'solo';

/** Resolve the Support-Range tier (visual + vocal, meters) for a Renown rank. */
export function getSupportRange(rank: RenownRank): SupportRangeTier {
    const tier = SUPPORT_RANGE_BY_RANK[rank];
    // Defensive copy — callers must not mutate the table.
    return { visual: tier.visual, vocal: tier.vocal };
}

/* -------------------------------------------- */
/*  Mode transitions                            */
/* -------------------------------------------- */

/** Means by which a Battle-Brother transitioned into Squad Mode. */
type SquadEntryMethod = 'full-action' | 'cohesion-challenge';

/** Input shape for {@link canEnterSquadMode}. */
export interface CanEnterSquadModeArgs {
    /** The Battle-Brother's current combat mode. */
    currentMode: DwMode;
    /** Whether the brother is spending their Full Action this turn. */
    hasFullAction: boolean;
    /** Whether the brother has just passed a Cohesion Challenge. */
    passedCohesionChallenge: boolean;
}

/** Result shape for {@link canEnterSquadMode}. */
export interface CanEnterSquadModeResult {
    /** Whether the transition into Squad Mode is permitted. */
    allowed: boolean;
    /** Which RAW path authorises the transition, or `null` if none does. */
    via: SquadEntryMethod | null;
}

/**
 * Resolve whether a Battle-Brother may enter Squad Mode this turn.
 *
 * RAW gates: must currently be in Solo Mode, AND must either spend a
 * Full Action or have passed a Cohesion Challenge. The Full Action is
 * preferred when both are available (it doesn't burn the squad's
 * Cohesion pool); the Cohesion Challenge path remains as a fallback
 * for callers that only have the challenge outcome.
 */
export function canEnterSquadMode(args: CanEnterSquadModeArgs): CanEnterSquadModeResult {
    if (args.currentMode === 'squad') {
        return { allowed: false, via: null };
    }
    if (args.hasFullAction) {
        return { allowed: true, via: 'full-action' };
    }
    if (args.passedCohesionChallenge) {
        return { allowed: true, via: 'cohesion-challenge' };
    }
    return { allowed: false, via: null };
}

/** Result shape for {@link enterSquadMode} and {@link leaveSquadMode}. */
export interface ModeTransitionResult {
    /** The mode after the (attempted) transition. */
    newMode: DwMode;
    /** Whether a transition actually happened (false if already in target mode). */
    transitioned: boolean;
}

/**
 * Apply a Solo → Squad transition. Idempotent: re-entering Squad Mode
 * while already in Squad Mode is a no-op and `transitioned` is false
 * so callers can skip side-effects (chat card, Cohesion spend).
 *
 * This function does NOT gate on Full Action / Cohesion Challenge —
 * call {@link canEnterSquadMode} first if you need RAW gating. Mode
 * transitions can also be GM-fiat'd at the table.
 */
export function enterSquadMode(currentMode: DwMode): ModeTransitionResult {
    if (currentMode === 'squad') {
        return { newMode: 'squad', transitioned: false };
    }
    return { newMode: 'squad', transitioned: true };
}

/**
 * Apply a Squad → Solo transition. Idempotent: leaving Squad Mode
 * while already in Solo Mode is a no-op and `transitioned` is false.
 */
export function leaveSquadMode(currentMode: DwMode): ModeTransitionResult {
    if (currentMode === 'solo') {
        return { newMode: 'solo', transitioned: false };
    }
    return { newMode: 'solo', transitioned: true };
}

/* -------------------------------------------- */
/*  Ability activation                          */
/* -------------------------------------------- */

/**
 * Describes a Squad-mode ability activation request. The `abilityId`
 * is a compendium-resolved identifier (e.g. the ability item's UUID
 * or its slug); this module does not interpret it beyond passing it
 * through.
 */
export interface SquadAbilityActivation {
    /** Cohesion cost paid on activation (RAW: integer ≥ 0). */
    cohesionCost: number;
    /** Whether the ability persists turn-over-turn without re-payment. */
    sustained: boolean;
    /** Compendium-resolved identifier for the ability. */
    abilityId: string;
}

/** Why a {@link activateSquadAbility} call returned `allowed: false`. */
type SquadAbilityFailureReason = 'not-in-squad-mode' | 'insufficient-cohesion';

/** Input shape for {@link activateSquadAbility}. */
export interface ActivateSquadAbilityArgs {
    /** The Battle-Brother's current combat mode. */
    currentMode: DwMode;
    /** The kill-team's current Cohesion pool. */
    currentCohesion: number;
    /** The ability the brother is attempting to activate. */
    ability: SquadAbilityActivation;
}

/** Result shape for {@link activateSquadAbility}. */
export interface ActivateSquadAbilityResult {
    /** Whether activation succeeded. */
    allowed: boolean;
    /** Cohesion pool value after activation (unchanged when not allowed). */
    cohesionAfter: number;
    /** Diagnostic / chat-card reason code when activation fails. */
    reason?: SquadAbilityFailureReason;
}

/**
 * Resolve whether a Squad-mode ability may activate, and report the
 * Cohesion pool value after the cost is paid.
 *
 * RAW gates: the Battle-Brother must currently be in Squad Mode, AND
 * the kill-team must have enough Cohesion to cover the cost. Sustained
 * abilities pay only on the activation turn — re-applying them next
 * turn is the caller's bookkeeping, not a new `activateSquadAbility`
 * call.
 */
export function activateSquadAbility(args: ActivateSquadAbilityArgs): ActivateSquadAbilityResult {
    const cohesion = nonNegInt(args.currentCohesion);
    const cost = nonNegInt(args.ability.cohesionCost);

    if (args.currentMode !== 'squad') {
        return { allowed: false, cohesionAfter: cohesion, reason: 'not-in-squad-mode' };
    }
    if (cohesion < cost) {
        return { allowed: false, cohesionAfter: cohesion, reason: 'insufficient-cohesion' };
    }
    return { allowed: true, cohesionAfter: cohesion - cost };
}

/* -------------------------------------------- */
/*  Support range                               */
/* -------------------------------------------- */

/** Input shape for {@link withinSupportRange}. */
export interface WithinSupportRangeArgs {
    /** Renown rank of the Battle-Brother whose support radius is being checked. */
    actorRank: RenownRank;
    /** Distance from the brother to the squadmate, in meters. */
    distance: number;
    /** Whether visual line-of-sight to the squadmate is available. */
    hasVisual: boolean;
    /** Whether a vocal channel (vox or unaided shout) reaches the squadmate. */
    hasVocal: boolean;
}

/**
 * Resolve whether a squadmate is within the actor's Support Range.
 *
 * RAW (Table 7-9 footnote): support is maintained when the actor and
 * squadmate are within the rank-appropriate radius AND at least one
 * channel (visual OR vocal) is available. Both channels blocked breaks
 * support even at point-blank range; in-range with neither channel
 * is the standard "blinded and silenced" edge case.
 *
 * Negative or non-finite `distance` is treated as 0 (the brothers are
 * at the same point); callers that want to flag a malformed input
 * should validate before calling.
 */
export function withinSupportRange(args: WithinSupportRangeArgs): boolean {
    if (!args.hasVisual && !args.hasVocal) return false;
    const tier = SUPPORT_RANGE_BY_RANK[args.actorRank];
    const channelLimit = Math.max(args.hasVisual ? tier.visual : 0, args.hasVocal ? tier.vocal : 0);
    const distance = nonNegDistance(args.distance);
    return distance <= channelLimit;
}
