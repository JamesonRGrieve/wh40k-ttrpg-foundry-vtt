/**
 * Only War · Squad Logistics Rating + Logistics Test engine
 * (#154 — OW core.md §"THE LOGISTICS TEST", line 7064).
 *
 * Pure rules / math layer. The Squad Logistics Rating is the d100
 * target a Guardsman rolls under when requisitioning gear; the engine
 * composes the rating with the cumulative modifiers from
 * **Table 6-2: Availability by Front Conditions** (core.md line 7100)
 * and **Table 6-6: Craftsmanship and Logistics** (core.md line 7273).
 *
 * Per Direction #7 this module holds only content-agnostic primitives:
 * the four front-condition axes (troop count, time in front, front
 * active, war condition), the craftsmanship axis, and the three
 * stacking bonuses (Munitorum Influence Talent, situational GM
 * adjustment, standard-kit request). It does NOT enumerate items,
 * regiments, or talents — those live in compendium documents and are
 * surfaced through structured fields on the consuming DataModel.
 *
 * Distinct from DH2's `requisition-test.ts`: OW uses Squad Logistics
 * Rating (not Influence), Table 6-2's four cumulative front axes (not
 * a single availability tier), and OW-specific craftsmanship deltas
 * (Poor +20 / Good -30 / Best -50 vs DH2 +10 / -10 / -30).
 *
 * RNG-free and actor-decoupled; no I/O, no Foundry Document reads.
 */

/* -------------------------------------------------------------------- */
/*  Base rating + flat bonuses                                          */
/* -------------------------------------------------------------------- */

/** Default starting Logistics Rating for a freshly-founded squad (OW core.md line 7050). */
export const OW_DEFAULT_LOGISTICS_RATING = 10;

/** Munitorum Influence Talent bonus to Squad Logistics Rating (OW core.md line 6287, talent table line 5486). */
export const OW_MUNITORUM_INFLUENCE_BONUS = 5;

/**
 * Bonus applied when the requested gear is part of the standard kit
 * for ANY regiment engaged within the warzone (OW core.md line 7084).
 */
export const OW_STANDARD_KIT_BONUS = 20;

/* -------------------------------------------------------------------- */
/*  Craftsmanship axis — Table 6-6 (core.md line 7273)                  */
/* -------------------------------------------------------------------- */

export type Craftsmanship = 'poor' | 'common' | 'good' | 'best';

/**
 * **Table 6-6: Craftsmanship and Logistics** (OW core.md line 7273-7279).
 *
 * Note these are OW-specific values and intentionally differ from DH2's
 * `CRAFTSMANSHIP_MODIFIERS` in `requisition-test.ts` (DH2 uses Poor +10 /
 * Good -10 / Best -30). Do NOT consolidate the two tables.
 */
export const OW_CRAFTSMANSHIP_MODIFIER: Record<Craftsmanship, number> = {
    /** Routine (+20) — core.md line 7276. */
    poor: 20,
    /** Ordinary (+0) — core.md line 7277. */
    common: 0,
    /** Very Hard (-30) — core.md line 7278. */
    good: -30,
    /** Punishing (-50) — core.md line 7279. */
    best: -50,
};

/* -------------------------------------------------------------------- */
/*  Front condition axes — Table 6-2 (core.md line 7100)                */
/* -------------------------------------------------------------------- */

/**
 * Number of troops deployed to the front. Table 6-2 expresses this as
 * a 2-D crosstab of Availability × Troop Count, but for the engine
 * we collapse the troop-count axis into a flat modifier and let the
 * availability portion be supplied through a separate item lookup
 * (Table 6-2 column index). The values below are chosen along the
 * "Common" availability row of Table 6-2 (core.md line 7107) so the
 * Common-craftsmanship Common-availability baseline lands at 0 for
 * Company-or-Less troop counts, then steps up by +10 per troop tier
 * — matching how the table's columns shift difficulty by one step.
 *
 * Engines that wish to add the per-availability column delta on top
 * may do so separately; this constant only encodes the troop axis.
 */
export type TroopCount = 'squad' | 'platoon' | 'company' | 'regiment';

/**
 * Troop-count axis modifier. Sourced from Table 6-2's column structure
 * (core.md line 7102-7114): each successive column (Company or Less →
 * Single Regiment → Multiple Regiments) raises ease by +10. We extend
 * downward for a sub-Company "Squad / Platoon" deployment (core.md
 * §"REGIMENTAL LOGISTICS" line 7030 references squad-scale Logistics
 * Rating tiers in Table 6-1 line 7072 starting at 5).
 */
export const OW_TROOP_COUNT_MOD: Record<TroopCount, number> = {
    /** Single squad-scale deployment — extrapolated below "Company or Less". */
    squad: -20,
    /** Platoon-scale deployment — extrapolated one step below "Company or Less". */
    platoon: -10,
    /** "Company or Less" column baseline (Table 6-2 line 7107 Common row). */
    company: 0,
    /** "Single Regiment" column (Table 6-2 line 7107 Ordinary +10). */
    regiment: 10,
};

/**
 * How long the squad has been deployed to the current front
 * (OW core.md line 7116-7121, "Time Spent in Front" rows of Table 6-2).
 */
export type TimeInFront = 'days' | 'weeks' | 'months' | 'years';

export const OW_TIME_IN_FRONT_MOD: Record<TimeInFront, number> = {
    /** Less than 3 Months — Difficult (-10) — core.md line 7117. */
    days: -10,
    /** 3-6 Months — Challenging (+0) — core.md line 7118. */
    weeks: 0,
    /** 6-12 Months / 1-5 Years — Ordinary (+10) / Routine (+20). We take the
     *  Ordinary tier as the "months" baseline — core.md line 7119. */
    months: 10,
    /** 5+ Years — Easy (+30) — core.md line 7121. */
    years: 30,
};

/**
 * How long the front itself has been active. Table 6-2 reuses the same
 * tier structure for "Front Active" (core.md line 7122-7127). We collapse
 * the five rows into three states (lull / active / major) per the brief.
 */
export type FrontActive = 'lull' | 'active' | 'major';

export const OW_FRONT_ACTIVE_MOD: Record<FrontActive, number> = {
    /** Front in a lull — equivalent to a long-established quiet front (Easy +30, core.md line 7121 mirror). */
    lull: 10,
    /** Active front — 3-6 Months tier — Challenging (+0) — core.md line 7124. */
    active: 0,
    /** Major front-wide engagement — newly-formed front, Less than 3 Months — Difficult (-10) — core.md line 7123. */
    major: -20,
};

/**
 * Overall war-conditions axis (OW core.md line 7128-7134, "War Conditions"
 * rows of Table 6-2). We collapse the six published tiers into three
 * states (standard / hostile / desperate) per the brief.
 */
export type WarCondition = 'standard' | 'hostile' | 'desperate';

export const OW_WAR_CONDITION_MOD: Record<WarCondition, number> = {
    /** Violent Impasse / Near Victorious / Ceasefire baseline — Violent Impasse Difficult (-10) is the canonical "default" cited in the worked example (core.md line 7088); we round to Challenging (+0) so a "standard" war contributes nothing on its own. */
    standard: 0,
    /** Faltering — Hard (-20) — core.md line 7130. */
    hostile: -20,
    /** Losing Badly — Very Hard (-30) — core.md line 7129. */
    desperate: -30,
};

/* -------------------------------------------------------------------- */
/*  Composition                                                         */
/* -------------------------------------------------------------------- */

/**
 * Inputs to the Logistics Test target calculation. All fields are
 * required — callers default omitted axes to their neutral tier
 * (`craftsmanship: 'common'`, `warCondition: 'standard'`, etc.) before
 * invoking the engine.
 */
export interface LogisticsContext {
    /** Base Squad Logistics Rating (default 10 per `OW_DEFAULT_LOGISTICS_RATING`). */
    readonly rating: number;
    /** True if any squad member has Munitorum Influence (+5 to rating). */
    readonly munitorum: boolean;
    /** GM situational adjustment, in points (commonly ±5 per core.md line 7050-7056). */
    readonly situational: number;
    readonly troopCount: TroopCount;
    readonly timeInFront: TimeInFront;
    readonly frontActive: FrontActive;
    readonly warCondition: WarCondition;
    /** True if the requested gear is in any deployed regiment's standard kit (+20). */
    readonly standardKit: boolean;
    readonly craftsmanship: Craftsmanship;
}

/**
 * Per-axis modifier values applied to compute the final target.
 *
 * Keys are stable identifiers (the breakdown is consumed by chat cards
 * and dialog summaries); each entry's display label is resolved via
 * `WH40K.OW.Logistics.Modifier.*` at the UI layer.
 */
export type LogisticsBreakdown = {
    readonly rating: number;
    readonly munitorum: number;
    readonly situational: number;
    readonly troopCount: number;
    readonly timeInFront: number;
    readonly frontActive: number;
    readonly warCondition: number;
    readonly standardKit: number;
    readonly craftsmanship: number;
};

export interface LogisticsTarget {
    /** Final d100 target — sum of every breakdown entry, clamped to 0. */
    readonly target: number;
    readonly breakdown: LogisticsBreakdown;
}

/**
 * Compute the d100 target for a Logistics Test from a fully-populated
 * context. The breakdown returned alongside the target enumerates every
 * contributing modifier so chat-card UIs can render them transparently.
 */
export function computeLogisticsTarget(ctx: LogisticsContext): LogisticsTarget {
    const breakdown: LogisticsBreakdown = {
        rating: ctx.rating,
        munitorum: ctx.munitorum ? OW_MUNITORUM_INFLUENCE_BONUS : 0,
        situational: ctx.situational,
        troopCount: OW_TROOP_COUNT_MOD[ctx.troopCount],
        timeInFront: OW_TIME_IN_FRONT_MOD[ctx.timeInFront],
        frontActive: OW_FRONT_ACTIVE_MOD[ctx.frontActive],
        warCondition: OW_WAR_CONDITION_MOD[ctx.warCondition],
        standardKit: ctx.standardKit ? OW_STANDARD_KIT_BONUS : 0,
        craftsmanship: OW_CRAFTSMANSHIP_MODIFIER[ctx.craftsmanship],
    };

    const sum =
        breakdown.rating +
        breakdown.munitorum +
        breakdown.situational +
        breakdown.troopCount +
        breakdown.timeInFront +
        breakdown.frontActive +
        breakdown.warCondition +
        breakdown.standardKit +
        breakdown.craftsmanship;

    return { target: Math.max(0, sum), breakdown };
}

/* -------------------------------------------------------------------- */
/*  Roll resolution                                                     */
/* -------------------------------------------------------------------- */

export interface LogisticsTestResult {
    readonly success: boolean;
    /** Degrees of Success — `floor((target - roll) / 10)`, clamped >= 0. Zero on a marginal success. */
    readonly degreesOfSuccess: number;
    /** Degrees of Failure — `floor((roll - target) / 10)`, clamped >= 0. Zero on a marginal failure. */
    readonly degreesOfFailure: number;
    readonly target: number;
    readonly breakdown: LogisticsBreakdown;
}

/**
 * Resolve a Logistics Test against a context-derived target.
 *
 * Per OW d100 conventions a roll equal to the target is a success
 * (roll-under-or-equal). DoS / DoF are reported per OW core.md line
 * 7066 ("for every Degree of Success on the Test, the character
 * receives a +10 bonus") — i.e. one degree per 10-point margin.
 */
export function resolveLogisticsTest(ctx: LogisticsContext, roll: number): LogisticsTestResult {
    const { target, breakdown } = computeLogisticsTarget(ctx);
    const success = roll <= target;
    const degreesOfSuccess = success ? Math.max(0, Math.floor((target - roll) / 10)) : 0;
    const degreesOfFailure = success ? 0 : Math.max(0, Math.floor((roll - target) / 10));
    return { success, degreesOfSuccess, degreesOfFailure, target, breakdown };
}
