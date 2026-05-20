/**
 * Only War · Battlefield Awareness & Manoeuvres — Support Asset Request
 * (#161 — OW core.md §"BATTLEFIELD AWARENESS AND MANOEUVRES" line 13361,
 * §"Support" line 13411).
 *
 * Pure-rules engine for calling in off-table support assets (artillery
 * barrages, air strikes, reinforcement waves, orbital fire). Each
 * support call is a Logistics-flavored d100 test against a modified
 * target: the squad's current Logistics target is shifted by the
 * asset's `logisticsModifier` (a negative number makes the request
 * harder, mirroring how scarcer / more potent assets do in Table 6-2's
 * column structure). On a successful request the asset arrives in a
 * fixed number of turns (`turnsUntilArrival`) and the squad's per-asset
 * cooldown begins ticking down via `applySupportCooldown`.
 *
 * Per Direction #7 this module owns only the content-agnostic kinds and
 * the arithmetic of the modifier / cooldown loop. Concrete assets, named
 * artillery batteries, and per-regiment availability live in compendium
 * documents and are surfaced through structured `SupportAssetDef` fields
 * on the consuming DataModel; the engine never enumerates them.
 *
 * Distinct from `ow-logistics.ts`: that module composes the *baseline*
 * Logistics target from front conditions and craftsmanship; this module
 * shifts that target by an asset-specific modifier and resolves the
 * request → arrival → cooldown lifecycle. Callers compose the two by
 * passing `computeLogisticsTarget(ctx).target` in as
 * `currentLogisticsTarget`.
 *
 * RNG-free and actor-decoupled.
 */

/* -------------------------------------------------------------------- */
/*  Asset kinds & definitions                                           */
/* -------------------------------------------------------------------- */

/**
 * Categorical kind of support asset. Used by chat-card and dialog UIs to
 * select the right localized label / icon; the engine itself only cares
 * about the per-asset numeric modifier and cooldown.
 */
export type SupportAssetKind = 'artillery' | 'air-strike' | 'reinforcements' | 'orbital';

/**
 * A support-asset definition — the data shape compendium-backed assets
 * resolve into when a Guardsman calls one in. `logisticsModifier` is
 * applied to the squad's current Logistics target: negative values make
 * the call harder (rare / potent assets), positive values make it easier
 * (over-stocked / nearby assets).
 */
export interface SupportAssetDef {
    /** Stable identifier (compendium item id or canonical slug). */
    readonly id: string;
    /** Kind for label / icon selection. */
    readonly kind: SupportAssetKind;
    /**
     * Adjustment to the caller's current Logistics target. Negative ⇒
     * harder request; positive ⇒ easier request. Applied additively.
     */
    readonly logisticsModifier: number;
    /**
     * Turns the squad must wait after a successful request before this
     * asset can be requested again. Must be ≥ 0. Cooldowns of 0 mean the
     * asset can be re-requested on the next turn without delay.
     */
    readonly cooldownTurns: number;
}

/* -------------------------------------------------------------------- */
/*  Request resolution                                                  */
/* -------------------------------------------------------------------- */

export interface SupportRequestInput {
    readonly asset: SupportAssetDef;
    /**
     * The squad's *current* Logistics-test target (typically the
     * `target` field of a `LogisticsTarget` computed from the squad's
     * current front conditions). Shifted by `asset.logisticsModifier`
     * to produce the effective target.
     */
    readonly currentLogisticsTarget: number;
    /** d100 roll the Guardsman just made (1-100). */
    readonly roll: number;
}

export interface SupportRequestResult {
    readonly successful: boolean;
    /** Logistics target after applying the asset's modifier; clamped to ≥ 0. */
    readonly effectiveTarget: number;
    /**
     * Turns from now until the asset arrives on the table. Present only
     * when the request succeeded; computed as `max(1, ceil(cooldown/2))`
     * so even a zero-cooldown asset takes at least one turn to deploy.
     */
    readonly turnsUntilArrival?: number;
}

/**
 * Resolve a support-asset request. The Guardsman rolls a d100 against
 * the effective Logistics target (current target + asset modifier,
 * clamped to ≥ 0). On a roll-under-or-equal success the asset arrives
 * in `max(1, ceil(cooldownTurns / 2))` turns; on failure the asset is
 * unavailable and the caller decides whether a partial cooldown applies
 * (most tables let the squad retry next turn).
 */
export function requestSupport(input: SupportRequestInput): SupportRequestResult {
    const effectiveTarget = Math.max(0, input.currentLogisticsTarget + input.asset.logisticsModifier);
    const successful = input.roll <= effectiveTarget;
    if (!successful) {
        return { successful: false, effectiveTarget };
    }
    const cooldown = Math.max(0, input.asset.cooldownTurns);
    const turnsUntilArrival = Math.max(1, Math.ceil(cooldown / 2));
    return { successful: true, effectiveTarget, turnsUntilArrival };
}

/* -------------------------------------------------------------------- */
/*  Cooldown loop                                                       */
/* -------------------------------------------------------------------- */

export interface CooldownInput {
    /** Current remaining cooldown in turns. Treated as 0 if negative. */
    readonly remainingCooldown: number;
    /** Number of turns to advance the cooldown by. Treated as 0 if negative. */
    readonly turnsElapsed: number;
}

/**
 * Advance an asset's cooldown by `turnsElapsed` turns and clamp the
 * result at 0. Once the return value reaches 0 the asset is requestable
 * again. Callers tick cooldowns at turn-end via this pure helper.
 */
export function applySupportCooldown(input: CooldownInput): number {
    const remaining = Number.isFinite(input.remainingCooldown) ? input.remainingCooldown : 0;
    const elapsed = Number.isFinite(input.turnsElapsed) ? input.turnsElapsed : 0;
    return Math.max(0, Math.max(0, remaining) - Math.max(0, elapsed));
}
