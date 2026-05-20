/**
 * Only War · Regimental Drawbacks + Mixed Regiments + Multiple Comrades
 * (#160 — hammer.md §"REGIMENTAL DRAWBACKS" line 1150, §"MIXED REGIMENTS"
 * line 1311, §"Comrade Advances / Multiple Comrades" lines 1677, 1713).
 *
 * Pure rules / math layer. Per Direction #7 the engine never references
 * concrete drawback names, homeworld ids, or commanding officer ids —
 * those live in compendium documents. The caller supplies the
 * drawback descriptors (resolved from the compendium / origin path),
 * the base RegimentSelection, the per-member override slots, and the
 * comrade roster shape; this module returns the budget adjustment,
 * the merged penalty grants, the per-member effective selection, and
 * the updated roster.
 *
 * Three orthogonal pieces:
 *   1. Drawbacks — refund points to the 12-point Regiment Creation
 *      budget AND attach a penalty descriptor (negative characteristic
 *      deltas, additional skill / talent grants modelling the
 *      restriction, wound / logistics / kit deltas).
 *   2. Mixed Regiments — per-member overrides for Home World and
 *      Commanding Officer slots on top of a shared base selection
 *      (RAW: a stranded squad combined from multiple regiments).
 *   3. Multiple Comrades — a roster shape that tracks one "primary"
 *      Comrade plus a list of additional Comrade ids, with helpers for
 *      counting, adding (dedupe), and removing (with primary promotion).
 *
 * The engine is RNG-free and actor-decoupled; no I/O, no Foundry
 * Document reads. The consuming DataModel / sheet / dialog calls
 * these functions during selection and on commit.
 */

import type { RegimentGrants } from './ow-regiment-creation';

/* -------------------------------------------------------------------- */
/*  Regimental Drawbacks                                                */
/* -------------------------------------------------------------------- */

/**
 * One Regimental Drawback descriptor. `refund` is the positive number
 * of points returned to the 12-point Regiment Creation budget; `penalty`
 * is a `RegimentGrants` whose values are conventionally negative
 * (characteristic deltas) or restrictive (extra forbidden-skill flags,
 * negative wounds / logistics / kitModifier).
 *
 * The engine treats `penalty` as opaque grants — it does not enforce
 * sign on individual fields. A drawback that grants a *positive*
 * fluff-only skill list is allowed; the consumer decides how to
 * surface it.
 */
export interface RegimentDrawback {
    readonly id: string;
    readonly description: string;
    readonly refund: number;
    readonly penalty: RegimentGrants;
}

/**
 * Result of applying a set of drawbacks to a regiment's base budget.
 *
 * - `adjustedBudget` — the new budget total after refunds.
 * - `appliedRefund` — the sum of every drawback's `refund` (sanitised
 *   against non-finite values).
 */
export interface DrawbackBudgetResult {
    readonly adjustedBudget: number;
    readonly appliedRefund: number;
}

/**
 * Compute the new Regiment Creation budget after applying a list of
 * drawbacks. Each drawback returns its `refund` worth of points;
 * `adjustedBudget = baseBudget + sum(refunds)`.
 *
 * Non-finite refunds are skipped; the engine does not throw on bad
 * input (compendium documents are the source of truth, and a
 * malformed entry should not break the budget calculation).
 */
export function applyDrawbacksToBudget(baseBudget: number, drawbacks: ReadonlyArray<RegimentDrawback>): DrawbackBudgetResult {
    const safeBase = Number.isFinite(baseBudget) ? baseBudget : 0;
    let appliedRefund = 0;
    for (const dr of drawbacks) {
        if (Number.isFinite(dr.refund)) {
            appliedRefund += dr.refund;
        }
    }
    return { adjustedBudget: safeBase + appliedRefund, appliedRefund };
}

/**
 * Merge the `penalty` `RegimentGrants` of every drawback into a single
 * aggregate. Characteristics sum per key, skill / talent lists
 * concatenate in drawback order, and wounds / logistics / kitModifier
 * sum. Mirrors {@link aggregateRegimentGrants} from
 * `ow-regiment-creation` so callers can splice the result onto an
 * actor the same way.
 *
 * Returns an aggregate with every sub-field present (zero / empty when
 * no drawback contributed) so the consumer can skip null-checks.
 */
export function mergeDrawbackPenalties(drawbacks: ReadonlyArray<RegimentDrawback>): RegimentGrants {
    const characteristics: Record<string, number> = {};
    const skills: string[] = [];
    const talents: string[] = [];
    let wounds = 0;
    let logistics = 0;
    let kitModifier = 0;

    for (const dr of drawbacks) {
        const p = dr.penalty;
        if (p.characteristics !== undefined) {
            for (const [key, value] of Object.entries(p.characteristics)) {
                if (!Number.isFinite(value)) continue;
                characteristics[key] = (characteristics[key] ?? 0) + value;
            }
        }
        if (p.skills !== undefined) {
            for (const s of p.skills) skills.push(s);
        }
        if (p.talents !== undefined) {
            for (const t of p.talents) talents.push(t);
        }
        if (p.wounds !== undefined && Number.isFinite(p.wounds)) {
            wounds += p.wounds;
        }
        if (p.logistics !== undefined && Number.isFinite(p.logistics)) {
            logistics += p.logistics;
        }
        if (p.kitModifier !== undefined && Number.isFinite(p.kitModifier)) {
            kitModifier += p.kitModifier;
        }
    }

    return { characteristics, skills, talents, wounds, logistics, kitModifier };
}

/* -------------------------------------------------------------------- */
/*  Mixed Regiments                                                     */
/* -------------------------------------------------------------------- */

/**
 * Per-member override slots for a Mixed Regiment. The base regiment
 * selection picks one Home World and one Commanding Officer; each
 * member of a stranded squad may instead carry their own. Both
 * override slots are optional — an absent slot falls back to the
 * base selection's value.
 *
 * The engine stores the override IDs as opaque strings (compendium
 * UUIDs in practice) so it remains content-agnostic.
 */
export interface MixedRegimentMemberOverride {
    readonly memberId: string;
    readonly homeWorldOverrideId?: string;
    readonly commandingOfficerOverrideId?: string;
}

/**
 * The slice of `RegimentSelection` that Mixed Regiments may override.
 * Defined locally so this module does not need to widen
 * `RegimentSelection` itself.
 */
export interface MixedRegimentBaseSelection {
    readonly homeWorld?: string;
    readonly commandingOfficer?: string;
}

/**
 * Apply a member's override on top of the base regiment selection.
 * Caller-provided overrides win; empty / absent slots fall back to
 * the base selection. The result omits empty slots — the returned
 * object is the *effective* selection for that member.
 */
export function applyMixedRegimentOverrides(
    baseSelection: MixedRegimentBaseSelection,
    override: MixedRegimentMemberOverride,
): { homeWorld?: string; commandingOfficer?: string } {
    const result: { homeWorld?: string; commandingOfficer?: string } = {};

    const effectiveHome =
        override.homeWorldOverrideId !== undefined && override.homeWorldOverrideId !== '' ? override.homeWorldOverrideId : baseSelection.homeWorld;
    if (effectiveHome !== undefined && effectiveHome !== '') {
        result.homeWorld = effectiveHome;
    }

    const effectiveCO =
        override.commandingOfficerOverrideId !== undefined && override.commandingOfficerOverrideId !== ''
            ? override.commandingOfficerOverrideId
            : baseSelection.commandingOfficer;
    if (effectiveCO !== undefined && effectiveCO !== '') {
        result.commandingOfficer = effectiveCO;
    }

    return result;
}

/* -------------------------------------------------------------------- */
/*  Multiple Comrades                                                   */
/* -------------------------------------------------------------------- */

/**
 * A character's full Comrade roster. RAW each PC has exactly one
 * Comrade; Comrade Advances (hammer.md line 1677) and Multiple
 * Comrades (line 1713) extend that with additional Comrades that
 * are tracked independently.
 *
 * - `primaryId` — the canonical Comrade (the one whose Cohesion / hit-
 *   transfer / Fear-mirror plumbing runs through `ow-comrade.ts`).
 * - `additionalIds` — every further Comrade granted by Advances, in
 *   acquisition order. The list is deduplicated (same id never
 *   appears twice).
 */
export interface MultiComradeRoster {
    readonly primaryId: string;
    readonly additionalIds: ReadonlyArray<string>;
}

/**
 * Total Comrade count: 1 (primary) + length of additionals. The
 * primary slot is treated as always-present here; a character with
 * no Comrade at all should be represented by the absence of a roster,
 * not by an empty `primaryId`.
 */
export function totalComradeCount(roster: MultiComradeRoster): number {
    return 1 + roster.additionalIds.length;
}

/**
 * Append a new Comrade id to the roster. If the id already exists
 * (as primary or in additionals), the roster is returned unchanged
 * to satisfy the dedupe contract.
 */
export function addComrade(roster: MultiComradeRoster, newComradeId: string): MultiComradeRoster {
    if (newComradeId === '') return roster;
    if (roster.primaryId === newComradeId) return roster;
    if (roster.additionalIds.includes(newComradeId)) return roster;
    return {
        primaryId: roster.primaryId,
        additionalIds: [...roster.additionalIds, newComradeId],
    };
}

/**
 * Remove a Comrade from the roster.
 *
 * - If `comradeId` matches an entry in `additionalIds`, that entry is
 *   spliced out and the primary is untouched.
 * - If `comradeId` matches `primaryId`, the first additional Comrade
 *   (if any) is promoted to primary; otherwise the roster is returned
 *   unchanged (a character cannot drop below their primary slot —
 *   that path is "no Comrade at all", which is the *absence* of a
 *   roster, modelled by the caller).
 * - If `comradeId` matches neither, the roster is returned unchanged.
 */
export function removeComrade(roster: MultiComradeRoster, comradeId: string): MultiComradeRoster {
    if (comradeId === '') return roster;

    if (roster.primaryId === comradeId) {
        const first = roster.additionalIds[0];
        if (first === undefined) return roster;
        return {
            primaryId: first,
            additionalIds: roster.additionalIds.slice(1),
        };
    }

    const idx = roster.additionalIds.indexOf(comradeId);
    if (idx === -1) return roster;
    const next = roster.additionalIds.slice(0, idx).concat(roster.additionalIds.slice(idx + 1));
    return {
        primaryId: roster.primaryId,
        additionalIds: next,
    };
}
