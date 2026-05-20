/**
 * Only War · Mission Assignment Gear
 * (#155 — OW core.md §"MISSION ASSIGNMENT GEAR", line 7156).
 *
 * Pure rules / math layer for the gear-roll layered on top of the standard
 * Logistics Test. Per OW core.md the Mission Assignment Gear roll is an
 * **Ordinary (+10) Logistics Test** with situational modifiers drawn from
 * **Table 6-3** stacked on top of the Logistics target. The result ladder
 * is encoded in **Table 6-4** (DoF/DoS → kit tier), and a successful gear
 * roll may be supplemented with a d100 roll on **Table 6-5: Random Issue
 * Gear** to pick a bonus item.
 *
 * RNG-free except for the explicit `rollRandomIssueGear` helper, which
 * accepts an injected `() => number` so callers can seed deterministic
 * stories / tests. No I/O, no Foundry Document reads. Composes with
 * `./ow-logistics`'s `computeLogisticsTarget` — callers pass the base
 * target through `applyTable63Modifiers` to stack the +10 Ordinary bonus
 * and any Table 6-3 deltas before resolving the d100.
 */

/* -------------------------------------------------------------------- */
/*  Ordinary bonus + Table 6-3 modifier composition                     */
/* -------------------------------------------------------------------- */

/**
 * Mission Assignment Gear rolls are made at Ordinary difficulty
 * (+10 to the underlying Logistics target). OW core.md line 7156.
 */
export const ORDINARY_DIFFICULTY_BONUS = 10;

/** Stable identifier for the Ordinary bonus row inside the breakdown. */
export const ORDINARY_BONUS_KEY = 'ordinary';

/** Single modifier row applied to the gear roll's target. */
export interface MissionGearModifier {
    readonly description: string;
    readonly value: number;
}

/** Result of composing the base target with the Ordinary bonus + Table 6-3. */
export interface MissionGearTarget {
    /** Final d100 target — the base target plus every breakdown entry. */
    readonly target: number;
    /**
     * Per-row breakdown. The first entry is always the Ordinary (+10)
     * bonus; subsequent entries are the caller's Table 6-3 modifiers,
     * preserved in their incoming order.
     */
    readonly breakdown: ReadonlyArray<MissionGearModifier>;
}

/**
 * Compose the final gear-roll target from a base Logistics target and a
 * caller-supplied list of Table 6-3 situational modifiers. The Ordinary
 * (+10) bonus is always pre-applied as the first breakdown row so the
 * UI can render it transparently alongside the situational rows.
 *
 * Pure: makes no assumption about which Table 6-3 modifiers apply —
 * those are content-specific and discovered at the consumer (compendium-
 * driven mission documents, GM dialog inputs, etc.).
 */
export function applyTable63Modifiers(baseTarget: number, modifiers: ReadonlyArray<MissionGearModifier>): MissionGearTarget {
    const breakdown: MissionGearModifier[] = [{ description: ORDINARY_BONUS_KEY, value: ORDINARY_DIFFICULTY_BONUS }, ...modifiers];
    const sum = breakdown.reduce((acc, row) => acc + row.value, 0);
    return { target: baseTarget + sum, breakdown };
}

/* -------------------------------------------------------------------- */
/*  Table 6-4 — result ladder                                           */
/* -------------------------------------------------------------------- */

/**
 * Tiers of gear issued by the Mission Assignment Gear roll
 * (OW core.md Table 6-4, line 7156+).
 */
export type GearOutcome = 'surrender-kit' | 'minimum-kit' | 'standard-kit' | 'bonus-items';

/**
 * One row of Table 6-4. Each entry matches when the rolled DoF/DoS hits
 * the row's threshold; the ladder is scanned top-to-bottom so callers
 * MUST order it from harshest failure to greatest success.
 *
 * `minDof` and `minDos` are mutually exclusive per row: a failure row
 * sets `minDof`, a success row sets `minDos`. The "no-margin" row
 * (DoS / DoF both zero) is encoded as a success row with `minDos: 0`.
 */
export interface GearResultLadder {
    readonly outcome: GearOutcome;
    readonly minDof?: number;
    readonly minDos?: number;
    /** Number of d100 rolls on Table 6-5 the squad earns at this tier. */
    readonly bonusItemCount: number;
}

/**
 * **Table 6-4: Mission Assignment Gear Results** (OW core.md line 7156+).
 *
 * Ordered from harshest failure to greatest success so a linear scan
 * picks the first matching row. Entries are exclusive — a 4-DoF roll
 * matches `surrender-kit`, not `minimum-kit`.
 */
export const GEAR_RESULT_LADDER: ReadonlyArray<GearResultLadder> = [
    /** 4+ DoF → squad surrenders kit. */
    { outcome: 'surrender-kit', minDof: 4, bonusItemCount: 0 },
    /** 1-3 DoF → minimum kit. */
    { outcome: 'minimum-kit', minDof: 1, bonusItemCount: 0 },
    /** 4+ DoS → standard kit + 1 bonus item from Table 6-5. */
    { outcome: 'bonus-items', minDos: 4, bonusItemCount: 1 },
    /** 0-3 DoS (success / marginal) → standard kit. */
    { outcome: 'standard-kit', minDos: 0, bonusItemCount: 0 },
];

/** Inputs to `resolveGearOutcome`. Mirrors the OW Logistics test result shape. */
export interface GearResolutionInput {
    readonly degreesOfSuccess: number;
    readonly degreesOfFailure: number;
}

export interface GearResolution {
    readonly outcome: GearOutcome;
    readonly bonusItemCount: number;
}

/**
 * Resolve the gear-roll outcome from the underlying Logistics Test's
 * degrees of success / failure. The ladder is walked in declaration
 * order; the first row whose threshold is met wins.
 *
 * A roll with DoF >= 4 returns surrender-kit; DoF 1-3 returns minimum-
 * kit; DoS >= 4 returns bonus-items (1 extra item); 0-3 DoS returns
 * standard-kit. The terminal `standard-kit` row matches `minDos: 0`,
 * so a 0/0 marginal result still lands at standard-kit rather than
 * falling off the ladder.
 */
export function resolveGearOutcome({ degreesOfSuccess, degreesOfFailure }: GearResolutionInput): GearResolution {
    for (const row of GEAR_RESULT_LADDER) {
        if (row.minDof !== undefined && degreesOfFailure >= row.minDof) {
            return { outcome: row.outcome, bonusItemCount: row.bonusItemCount };
        }
        if (row.minDos !== undefined && degreesOfSuccess >= row.minDos && degreesOfFailure === 0) {
            return { outcome: row.outcome, bonusItemCount: row.bonusItemCount };
        }
    }
    // Defensive default — the ladder's terminal `standard-kit` row matches
    // any non-failing roll, so this branch is unreachable in practice.
    return { outcome: 'standard-kit', bonusItemCount: 0 };
}

/* -------------------------------------------------------------------- */
/*  Table 6-5 — Random Issue Gear d100                                  */
/* -------------------------------------------------------------------- */

/**
 * Roll 1d100 on Table 6-5: Random Issue Gear. The caller passes an
 * `rng` returning a value in `[0, 1)`; this helper converts to the
 * canonical d100 range `[1, 100]` via `floor(rng() * 100) + 1` and
 * clamps defensively in case a caller hands in a malformed RNG.
 *
 * The Table 6-5 row lookup itself lives at the content layer — this
 * helper just produces the raw die result so chat cards / dialog UIs
 * can resolve it against the compendium row.
 */
export function rollRandomIssueGear(rng: () => number): number {
    const raw = Math.floor(rng() * 100) + 1;
    if (raw < 1) {
        return 1;
    }
    if (raw > 100) {
        return 100;
    }
    return raw;
}
