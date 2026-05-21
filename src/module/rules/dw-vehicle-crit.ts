/**
 * Deathwatch Vehicle Critical Hit + Repair + Kill-Team Acquisition RAW
 * resolver (#170 — rites.md §"DAMAGING VEHICLES" / Table 4-2 p. 5823,
 * §"REPAIRING VEHICLES" p. 5845, §"KILL-TEAMS ACQUIRING VEHICLES"
 * p. 5884).
 *
 * Pure functions over a vehicle's accumulated over-Integrity damage and
 * a kill-team's Requisition budget. The caller (vehicle DataModel,
 * damage-resolution pipeline, requisition prompt, chat card) owns I/O;
 * this module owns the chart lookup, repair-difficulty resolution, and
 * the per-vehicle acquisition gate.
 *
 * Canonical rules referenced here:
 *   - TABLE 4-2: Vehicle Critical Hit Chart. RAW pairs 1-2 (Jarring
 *     Blow) and 8-9 (Destroyed); the system normalises this to ten
 *     discrete buckets so the chat-card / chart-display surfaces and
 *     per-entry compendium content can address each cell directly.
 *     The 10+ "Explodes" bucket retains its "and beyond" semantics —
 *     once `1d10 + over-Integrity` reaches ten or more, the result
 *     clamps to Wrecked.
 *   - "REPAIRING VEHICLES": Tech-Use Test difficulty scales with the
 *     severity of the suffered crit. Routine repairs (Minor) restore
 *     the vehicle to operational status quickly; Hard repairs (Wrecked,
 *     internal fire damage) require a properly-equipped repair shop.
 *   - "KILL-TEAMS ACQUIRING VEHICLES": a kill-team may requisition a
 *     vehicle when (a) the team RP pool covers the vehicle's base cost
 *     and (b) the requisitioning Battle-Brother's Renown rank meets or
 *     exceeds the vehicle's gate.
 *
 * Content (Direction #7): per-vehicle base RP cost, Renown gate, and
 * narrative descriptions live in compendium documents and the langpack
 * key-stems exposed below. This module holds only the chart math, the
 * difficulty-tier table, and the acquisition gate primitives.
 */

import { renownRankIndex, type RenownRank } from './dw-renown.ts';

/**
 * Twelve discrete Vehicle Critical Hit Chart cells (Table 4-2,
 * normalised — RAW's paired 1-2 and 8-9 entries split into discrete
 * "Minor", "Mobility", "Hull", and "Cargo" buckets so per-cell display
 * and compendium content can address each result independently).
 */
export type DwVehicleCritResult = 'minor' | 'mobility' | 'weapons' | 'crew' | 'engine' | 'fire' | 'catastrophic-fire' | 'hull' | 'cargo' | 'wrecked';

/** One row of the Vehicle Critical Hit Chart. */
export interface CritChartRow {
    /** Roll value (1..10) that this row resolves to. */
    roll: number;
    /** Mechanical result identifier — drives effect resolution. */
    result: DwVehicleCritResult;
    /**
     * Short narrative blurb summarising the in-fiction effect of this
     * result. Compendium content overrides this at the rendering edge
     * via langpack keys (`WH40K.DW.Vehicle.Crit.Result.<Pascal>`); the
     * string here is a stable fallback for code-only consumers.
     */
    description: string;
}

/**
 * TABLE 4-2 — Vehicle Critical Hit Chart. The lookup is `1d10 +
 * over-Integrity` clamped to `[1, 10]`. A final roll ≥ 10 always
 * resolves to "Wrecked" (Explodes in RAW).
 */
export const DW_VEHICLE_CRIT_CHART: ReadonlyArray<CritChartRow> = [
    { roll: 1, result: 'minor', description: 'Jarring Blow — crew shaken, shots go wide.' },
    { roll: 2, result: 'mobility', description: 'Staggered — pilot stunned, vehicle drifts to a halt.' },
    { roll: 3, result: 'weapons', description: 'Weapon Destroyed — a random weapon system is wrecked.' },
    { roll: 4, result: 'crew', description: 'Crew injury — passengers and gunners take splinter damage.' },
    { roll: 5, result: 'engine', description: 'Drive Damaged — Tactical Speed reduced; risk of immobilisation.' },
    { roll: 6, result: 'fire', description: 'Fire — fuel stores ignite; occupants risk catching alight.' },
    {
        roll: 7,
        result: 'catastrophic-fire',
        description: 'Catastrophic Fire — flames spread; chance the vehicle explodes each round.',
    },
    { roll: 8, result: 'hull', description: 'Penetrating Hit — armour breached on this facing.' },
    { roll: 9, result: 'cargo', description: 'Cargo/Compartment hit — stored materiel destroyed.' },
    { roll: 10, result: 'wrecked', description: 'Explodes — the vehicle is reduced to a burning hulk.' },
];

/**
 * The highest roll cell on the chart. Used to clamp the final roll
 * (`1d10 + over-Integrity`) so any oversize sum still resolves to a
 * defined row.
 */
const MAX_CHART_ROLL = 10;

/** Result of {@link rollVehicleCrit}. */
export interface RollVehicleCritResult {
    /** The raw 1d10 result before adding over-Integrity (1..10). */
    rolled: number;
    /** The post-modifier roll, clamped to [1, 10] for chart lookup. */
    finalRoll: number;
    /** The resolved chart result for {@link finalRoll}. */
    result: DwVehicleCritResult;
    /** Stable narrative blurb (see {@link CritChartRow.description}). */
    description: string;
}

/** Arguments to {@link rollVehicleCrit}. */
export interface RollVehicleCritArgs {
    /**
     * How much damage past the vehicle's Structural Integrity this hit
     * dealt. Per RAW, the chart is cumulative — a vehicle that has
     * already taken 2 over-Integrity then takes 4 more resolves at
     * `2 + 4 = 6` on the chart. Callers track the running total.
     *
     * Negative or non-finite values are coerced to zero so a misconfigured
     * call resolves to a clean 1d10 lookup.
     */
    overIntegrity: number;
    /**
     * RNG returning a value in `[0, 1)`. Defaults to `Math.random` so
     * production callers don't need to wire one up; tests inject a
     * seeded source for determinism.
     */
    rng?: () => number;
}

/**
 * Resolve a Vehicle Critical Hit. Rolls 1d10 via `rng`, adds the
 * cumulative `overIntegrity`, and clamps the lookup to `[1, 10]`.
 *
 * Returning both `rolled` and `finalRoll` lets the chat card surface
 * the modifier ("rolled 7, +3 over-Integrity → 10: Explodes") without
 * the caller having to re-derive the math.
 */
export function rollVehicleCrit(args: RollVehicleCritArgs): RollVehicleCritResult {
    const rng = args.rng ?? Math.random;
    const sample = rng();
    const safeSample = Number.isFinite(sample) && sample >= 0 && sample < 1 ? sample : 0;
    const rolled = Math.floor(safeSample * 10) + 1;
    const modifier = Number.isFinite(args.overIntegrity) && args.overIntegrity > 0 ? args.overIntegrity : 0;
    const finalRoll = Math.min(MAX_CHART_ROLL, Math.max(1, rolled + modifier));
    // Chart is constructed densely above; finalRoll is clamped to [1, 10].
    const row = DW_VEHICLE_CRIT_CHART[finalRoll - 1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: tsconfig.test.json has the flag off so the existence check reads as redundant, but tsconfig.json includes this file with the flag on, where the indexed access returns `CritChartRow | undefined`
    if (row === undefined) {
        throw new Error(`dw-vehicle-crit chart row missing for clamped roll ${finalRoll}`);
    }
    return {
        rolled,
        finalRoll,
        result: row.result,
        description: row.description,
    };
}

/** Tech-Use Test difficulty tier for vehicle repair (RAW p. 5845). */
export type RepairDifficulty = 'routine' | 'challenging' | 'hard';

/**
 * Map a chart result to the repair-difficulty tier. Cosmetic damage
 * (Minor) is Routine; weapon / mobility / cargo damage is Challenging
 * by RAW; structural / fire / wrecked damage requires Hard work in a
 * properly-equipped repair bay.
 */
const REPAIR_DIFFICULTY_BY_RESULT: Readonly<Record<DwVehicleCritResult, RepairDifficulty>> = {
    'minor': 'routine',
    'mobility': 'challenging',
    'weapons': 'challenging',
    'cargo': 'challenging',
    'crew': 'hard',
    'engine': 'hard',
    'hull': 'hard',
    'fire': 'hard',
    'catastrophic-fire': 'hard',
    'wrecked': 'hard',
};

export function repairDifficultyFor(result: DwVehicleCritResult): RepairDifficulty {
    return REPAIR_DIFFICULTY_BY_RESULT[result];
}

/**
 * Modifier applied to the Tech-Use Test for a given repair tier. RAW
 * uses the standard test-difficulty ladder (Routine +20, Challenging
 * +0, Hard -20); content-driven overrides (Tech-Marine omnissian
 * bonuses, machine-spirit boons) layer on top at the caller.
 */
const REPAIR_MODIFIER_BY_DIFFICULTY: Readonly<Record<RepairDifficulty, number>> = {
    routine: 20,
    challenging: 0,
    hard: -20,
};

export function repairModifierFor(difficulty: RepairDifficulty): number {
    return REPAIR_MODIFIER_BY_DIFFICULTY[difficulty];
}

/**
 * Per-vehicle acquisition rate, sourced from compendium content. The
 * `baseCost` is in kill-team Requisition Points; the `renownGate` is
 * the minimum Battle-Brother Renown rank required to take custody.
 */
export interface VehicleAcquisition {
    /** Kill-team RP cost to acquire the vehicle for one mission. */
    baseCost: number;
    /** Minimum Renown rank required to requisition this vehicle. */
    renownGate: RenownRank;
}

/** Arguments to {@link canKillTeamAcquire}. */
export interface CanKillTeamAcquireArgs {
    /** Current Requisition-Point pool available to the kill-team. */
    teamRp: number;
    /** The vehicle's compendium-sourced acquisition profile. */
    vehicle: VehicleAcquisition;
    /**
     * Renown rank of the requisitioning Battle-Brother (the one
     * taking custody). Per RAW, the holder's rank is what gates the
     * vehicle; other contributors don't need to meet it.
     */
    actorRenownRank: RenownRank;
}

/** Result of {@link canKillTeamAcquire}. */
export interface CanKillTeamAcquireResult {
    allowed: boolean;
    reason?: 'insufficient-rp' | 'rank-too-low';
}

/**
 * Resolve a kill-team vehicle requisition. Rank is evaluated first so
 * a too-junior leader gets a "rank too low" reason even when RP is
 * also short — this matches the order used by the personal armoury
 * requisition gate in {@link canActorRequisition} and keeps the
 * blocking-reason UI consistent across requisition flows.
 *
 * The Renown comparison uses the actor's already-resolved rank
 * (callers pass `getRenownRank(actor.renown)`), not a raw Renown
 * value, so the kill-team chat card can show the gating rank without
 * re-deriving it.
 */
export function canKillTeamAcquire(args: CanKillTeamAcquireArgs): CanKillTeamAcquireResult {
    const rankOk = renownRankIndex(args.actorRenownRank) >= renownRankIndex(args.vehicle.renownGate);
    if (!rankOk) {
        return { allowed: false, reason: 'rank-too-low' };
    }
    if (!(args.teamRp >= args.vehicle.baseCost)) {
        return { allowed: false, reason: 'insufficient-rp' };
    }
    return { allowed: true };
}
