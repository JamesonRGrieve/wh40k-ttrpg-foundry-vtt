/**
 * Deathwatch Mission framework + reward payout (#169 — core.md
 * §"MISSIONS" p. 10115, §"REWARDS" p. 10390).
 *
 * Pure data + math. A `DwMission` is the GM-authored structure for a
 * single kill-team operation: a rating, a set of objectives, and a set
 * of complications. Completed objectives award Renown + XP and recover
 * Cohesion (1 per completed objective per core.md). Triggered
 * complications subtract from the Renown payout.
 *
 * This module owns only the arithmetic — Renown application sits in
 * `./dw-renown` (`awardRenown` / `loseRenown` for clamps), Cohesion
 * recovery sits in `./dw-cohesion`, and XP application is on the
 * character DataModel. Consumers feed `computeMissionRewards` and then
 * apply each component through its owning system.
 *
 * Rating is content-agnostic: the four labels (standard / extended /
 * priority / critical) classify the mission's scope but do not multiply
 * the payout here — per-objective rewards are authored on the mission
 * itself. Callers that want a rating-driven multiplier should apply it
 * at authoring time, not in this resolver.
 */

import { RENOWN_MIN } from './dw-renown.ts';

/**
 * Mission rating — content-agnostic classification of mission scope.
 * Drives UI labelling only; per-objective rewards carry the actual
 * payout.
 */
export type MissionRating = 'standard' | 'extended' | 'priority' | 'critical';

/** Lifecycle state of a single mission objective. */
export type ObjectiveStatus = 'pending' | 'complete' | 'failed';

/**
 * A single mission objective. Rewards are authored on the objective
 * itself so the GM can tune individual stakes; the resolver sums them
 * by status at payout time.
 */
export interface MissionObjective {
    /** Stable identifier — used to key `perObjective` payout entries. */
    id: string;
    /** Player-facing description (already-localised string from the caller). */
    description: string;
    /** Renown awarded when this objective resolves `complete`. */
    renownReward: number;
    /** XP awarded when this objective resolves `complete`. */
    xpReward: number;
    /** Current lifecycle status. */
    status: ObjectiveStatus;
}

/**
 * A mission complication — an event the GM may trigger during play
 * that subtracts from the Renown payout when the mission settles.
 */
export interface MissionComplication {
    /** Stable identifier — referenced by the triggered list at payout. */
    id: string;
    /** Player-facing description. */
    description: string;
    /** Renown subtracted from the total payout when triggered. */
    renownPenalty: number;
}

/** GM-authored mission record. */
export interface DwMission {
    id: string;
    name: string;
    rating: MissionRating;
    objectives: MissionObjective[];
    complications: MissionComplication[];
}

/** Per-objective payout entry. */
interface MissionRewardEntry {
    id: string;
    renown: number;
    xp: number;
}

/** Computed reward payout for a settled mission. */
export interface MissionRewardResult {
    /** Net Renown award (sum of completed objectives less triggered complication penalties, floored at 0). */
    totalRenown: number;
    /** Sum of XP awarded by completed objectives. */
    totalXp: number;
    /** Cohesion points recovered — 1 per completed objective per core.md. */
    cohesionRecovered: number;
    /** Per-objective breakdown for chat-card display. */
    perObjective: MissionRewardEntry[];
    /** Complications resolved as triggered at payout time. */
    complicationsTriggered: MissionComplication[];
}

/** Non-finite or negative authoring values are coerced to 0 — never silently award negative rewards. */
function nonNegative(amount: number): number {
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Compute the reward payout for a settled mission.
 *
 * - Renown: sum of `renownReward` over completed objectives, minus the
 *   `renownPenalty` of each triggered complication. Clamped at
 *   `RENOWN_MIN` (the floor RAW recognises — see `./dw-renown`).
 * - XP: sum of `xpReward` over completed objectives. Failed and pending
 *   objectives contribute nothing.
 * - Cohesion: 1 point recovered per completed objective.
 *
 * `complicationsTriggered` is the list of complication `id`s the GM
 * marked triggered for this payout. Unknown ids are ignored.
 */
export function computeMissionRewards(mission: DwMission, complicationsTriggered: ReadonlyArray<string>): MissionRewardResult {
    const perObjective: MissionRewardEntry[] = [];
    let renown = 0;
    let xp = 0;
    let cohesionRecovered = 0;

    for (const objective of mission.objectives) {
        if (objective.status === 'complete') {
            const r = nonNegative(objective.renownReward);
            const x = nonNegative(objective.xpReward);
            renown += r;
            xp += x;
            cohesionRecovered += 1;
            perObjective.push({ id: objective.id, renown: r, xp: x });
        } else {
            perObjective.push({ id: objective.id, renown: 0, xp: 0 });
        }
    }

    const triggeredIds = new Set(complicationsTriggered);
    const triggered: MissionComplication[] = [];
    for (const complication of mission.complications) {
        if (triggeredIds.has(complication.id)) {
            renown -= nonNegative(complication.renownPenalty);
            triggered.push(complication);
        }
    }

    return {
        totalRenown: Math.max(RENOWN_MIN, renown),
        totalXp: xp,
        cohesionRecovered,
        perObjective,
        complicationsTriggered: triggered,
    };
}
