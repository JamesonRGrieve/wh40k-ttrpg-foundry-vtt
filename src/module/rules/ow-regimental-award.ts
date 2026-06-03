/**
 * Only War · Regimental Awards (#161 — OW core.md §"CREATING REGIMENTAL
 * AWARDS" line 13103).
 *
 * Pure-rules engine for the medal / honor items that recognise notable
 * deeds by Guardsmen of a particular regiment. Each Award carries a
 * structured bonus payload — a characteristic delta, a granted trait, or
 * a bonus Fate Point — that tooling reads to apply the mechanical effect
 * when the Award is conferred.
 *
 * Per Direction #7 this module owns only the data shape and the merge
 * arithmetic for combining multiple Awards into a single grant payload.
 * Concrete Awards (their names, descriptions, mission requirements, and
 * specific bonuses) live in compendium documents and are surfaced
 * through structured `RegimentalAward` fields on the consuming
 * DataModel; the engine never enumerates them.
 *
 * Parallel structure to `dw-distinction.ts` `mergeMarkGrants`: both
 * fold a set of honor items into one aggregated grant. The Awards
 * variant additionally accumulates bonus Fate Points (an OW-specific
 * concept — Deathwatch tracks Cohesion instead).
 *
 * RNG-free and actor-decoupled.
 */

/* -------------------------------------------------------------------- */
/*  Award definition                                                    */
/* -------------------------------------------------------------------- */

/**
 * The structured benefit a Regimental Award confers on its bearer.
 * All fields are optional so a single Award can grant any combination
 * of: a single characteristic modifier (e.g. +3 Willpower for a
 * commendation for valour), a trait (e.g. an honorific keyword used by
 * other rules), or one or more bonus Fate Points.
 */
interface RegimentalAwardBonus {
    /**
     * Short code of the characteristic to bump (e.g. `WS`, `WP`, `Fel`).
     * Paired with `modifier`; both must be present for a delta to apply.
     */
    characteristic?: string;
    /** Magnitude of the characteristic delta. Negative values permitted. */
    modifier?: number;
    /** Compendium UUID or canonical slug for a granted trait. */
    trait?: string;
    /** Bonus Fate Points granted to the bearer. Non-negative integer. */
    bonusFatePoint?: number;
}

export interface RegimentalAward {
    /** Stable identifier (compendium item id or canonical slug). */
    id: string;
    /** Display name (player-facing). */
    name: string;
    /** Narrative description (player-facing). */
    description: string;
    /** Structured grant payload — what the award actually does mechanically. */
    bonus: RegimentalAwardBonus;
}

/* -------------------------------------------------------------------- */
/*  Merge                                                               */
/* -------------------------------------------------------------------- */

export interface MergedRegimentalAwards {
    /**
     * Aggregated characteristic deltas, keyed by characteristic short
     * code. Multiple Awards bumping the same characteristic stack.
     */
    characteristicDelta: Record<string, number>;
    /**
     * Granted traits, de-duplicated. Multiple Awards granting the same
     * trait id collapse to one entry.
     */
    traits: string[];
    /** Sum of bonus Fate Points across all Awards. */
    bonusFatePoints: number;
}

/**
 * Merge a set of Regimental Awards into a single aggregated grant
 * payload. Characteristic deltas sum, traits de-duplicate by id, and
 * bonus Fate Points accumulate. Awards with empty / no-op bonuses are
 * tolerated and contribute nothing.
 */
export function mergeRegimentalAwards(awards: ReadonlyArray<RegimentalAward>): MergedRegimentalAwards {
    const characteristicDelta: Record<string, number> = {};
    const traitsSet = new Set<string>();
    let bonusFatePoints = 0;

    for (const award of awards) {
        const bonus = award.bonus;
        const characteristic = bonus.characteristic;
        const modifier = bonus.modifier;
        if (characteristic !== undefined && characteristic.length > 0 && modifier !== undefined && Number.isFinite(modifier)) {
            const prior = characteristicDelta[characteristic] ?? 0;
            characteristicDelta[characteristic] = prior + modifier;
        }
        if (bonus.trait !== undefined && bonus.trait.length > 0) {
            traitsSet.add(bonus.trait);
        }
        const fate = bonus.bonusFatePoint;
        if (fate !== undefined && Number.isFinite(fate) && fate > 0) {
            bonusFatePoints += fate;
        }
    }

    return {
        characteristicDelta,
        traits: Array.from(traitsSet),
        bonusFatePoints,
    };
}

/* -------------------------------------------------------------------- */
/*  Mission filtering — placeholder                                     */
/* -------------------------------------------------------------------- */

export interface AwardableForMissionInput {
    readonly awards: ReadonlyArray<RegimentalAward>;
    /**
     * Numeric mission rating the GM has assigned to the just-completed
     * operation. Reserved for future per-award eligibility logic — the
     * current implementation is content-agnostic and simply forwards
     * the entire `awards` list to the caller, which applies its own
     * compendium-driven eligibility rules.
     */
    readonly missionRating: number;
}

/**
 * Return the Regimental Awards eligible to be conferred after a mission
 * of the given `missionRating`. Content-agnostic by design (per
 * Direction #7): this engine does not enumerate Awards or know their
 * mission-rating thresholds — those live in compendium documents. The
 * function exists as the contracted hook point so the consuming
 * DataModel / prompt has a single entry to invoke, and so per-award
 * mission gates can be added without changing call sites.
 */
export function awardableForMission(input: AwardableForMissionInput): RegimentalAward[] {
    void input.missionRating;
    return Array.from(input.awards);
}
