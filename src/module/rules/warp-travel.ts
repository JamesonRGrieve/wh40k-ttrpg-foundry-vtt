/**
 * Rogue Trader Warp Travel — 5-stage Navigation resolver + Perils of the Warp
 * lookup (core.md §"NAVIGATING THE WARP", p. 183-186; Table 6-3
 * "Perils of the Warp", p. 161).
 *
 * The five RAW stages a Navigator works through for any warp passage are:
 *
 *   1. **Duration**           — GM-set base time of the voyage (Table 7-2).
 *   2. **Locate Astronomican**— Ordinary (+10) Awareness Test; degrees of
 *                               success / failure translate into a per-voyage
 *                               Navigation (Warp) modifier (±10 per DoS/DoF).
 *   3. **Chart Course**       — Ordinary (+10) Navigation (Warp) Test;
 *                               success means the Navigator detects warp
 *                               turbulence in advance (+20 on per-leg
 *                               Encounter rolls during Stage 4).
 *   4. **Steer the Vessel**   — Navigation (Warp) Skill Test using the modifier
 *                               from Stage 2 (Table 7-3 derives actual elapsed
 *                               duration from degrees of success/failure).
 *                               Failures rolling a 9 on either d10 throw the
 *                               vessel off-course.
 *   5. **Leave the Warp**     — Hard (-20) Navigation (Warp) Test; degrees of
 *                               failure indicate translation deviation.
 *
 * Each stage returns a typed per-stage outcome (`success` / `failure` /
 * `peril`). `resolveWarpJourney` composes the five outcomes into a single
 * journey summary that the chat card / GM dialog consume.
 *
 * Perils of the Warp (Table 6-3, p. 161) is a separate d100 lookup table
 * triggered when a Gellar field breach / catastrophic stage failure occurs
 * during a journey. The lookup is exposed as `rollPeril()` so it can be
 * invoked independently (e.g. from a Psychic Phenomena chat card on a
 * roll of 75+).
 *
 * RT-gated: every helper is callable from any game system, but
 * `isWarpTravelAvailable(systemId)` returns true only for `'rt'` — the
 * dialog/UX layer uses that to hide the surface under DH1/DH2/BC/DW/OW/IM
 * until those systems author their own warp-travel layer.
 *
 * Pure logic — no Foundry coupling. The dialog
 * (`warp-travel-dialog.ts`) drives the resolver, picks per-stage rolls
 * (or hand-entered values from the GM), and emits the chat card. RNG is
 * injectable so tests/stories stay deterministic.
 *
 * @issue #193
 */

import type { GameSystemId } from '../config/game-systems/types.ts';

// ---------------------------------------------------------------------------
// Per-stage primitives
// ---------------------------------------------------------------------------

/** Stable ids for the five Navigation stages. */
export type WarpStageId = 'duration' | 'locate-astronomican' | 'chart-course' | 'steer-vessel' | 'leave-warp';

/** Outcome verdicts for a single stage. */
type WarpStageStatus = 'success' | 'failure' | 'peril' | 'pending';

/** Base result for any stage. */
interface WarpStageResult {
    /** Stable stage identifier. */
    readonly stage: WarpStageId;
    /** Localization key for the stage label. */
    readonly labelKey: string;
    /** Final verdict. */
    readonly status: WarpStageStatus;
    /** Degrees of success (>= 0) for a passed roll, else 0. */
    readonly degreesOfSuccess: number;
    /** Degrees of failure (>= 0) for a failed roll, else 0. */
    readonly degreesOfFailure: number;
    /** Optional rolled d100 result. */
    readonly rolled?: number;
    /** Optional effective target the roll was tested against. */
    readonly target?: number;
    /** Optional human-readable summary (English fallback). */
    readonly note?: string;
}

/** RAW stage difficulty modifiers (Table 1-5 difficulty ladder). */
export const STAGE_DIFFICULTY: Readonly<Record<Exclude<WarpStageId, 'duration'>, number>> = Object.freeze({
    'locate-astronomican': 10, // Ordinary (+10) Awareness
    'chart-course': 10, // Ordinary (+10) Navigation (Warp)
    'steer-vessel': 0, // Challenging — modified by Stage 2 + per-passage difficulty
    'leave-warp': -20, // Hard (-20) Navigation (Warp)
});

/** Localization keys for stage labels. */
export const STAGE_LABEL_KEYS: Readonly<Record<WarpStageId, string>> = Object.freeze({
    'duration': 'WH40K.WarpTravel.Stage.Duration',
    'locate-astronomican': 'WH40K.WarpTravel.Stage.LocateAstronomican',
    'chart-course': 'WH40K.WarpTravel.Stage.ChartCourse',
    'steer-vessel': 'WH40K.WarpTravel.Stage.SteerVessel',
    'leave-warp': 'WH40K.WarpTravel.Stage.LeaveWarp',
});

/** Single-source registry of game systems that surface warp travel. */
const WARP_TRAVEL_SYSTEMS: ReadonlySet<GameSystemId> = new Set<GameSystemId>(['rt']);

/** RT-only gating helper. */
export function isWarpTravelAvailable(systemId: GameSystemId): boolean {
    return WARP_TRAVEL_SYSTEMS.has(systemId);
}

// ---------------------------------------------------------------------------
// d100 test math (degrees-of-success counting)
// ---------------------------------------------------------------------------

/** Inputs to a single d100 vs. target test. */
export interface D100TestInput {
    /** Rolled value (1-100). */
    readonly rolled: number;
    /** Effective target after all modifiers. */
    readonly target: number;
}

/**
 * Resolve a single d100 vs. target test, returning (passed, DoS, DoF).
 * RAW degrees-of-success counting: DoS = floor((target - rolled) / 10) on
 * a pass (>= 1), DoF = floor((rolled - target) / 10) on a fail (>= 1).
 * A natural "0 degrees" pass (rolled == target, or rolled exactly under
 * the next 10-band boundary) counts as one degree of success per FFG
 * standard (a successful test is always at least 1 DoS).
 */
export function resolveD100Test(input: D100TestInput): {
    passed: boolean;
    degreesOfSuccess: number;
    degreesOfFailure: number;
} {
    const { rolled, target } = input;
    if (rolled <= target) {
        const dos = Math.floor((target - rolled) / 10) + 1;
        return { passed: true, degreesOfSuccess: dos, degreesOfFailure: 0 };
    }
    const dof = Math.floor((rolled - target) / 10) + 1;
    return { passed: false, degreesOfSuccess: 0, degreesOfFailure: dof };
}

// ---------------------------------------------------------------------------
// Stage 2 — Locate the Astronomican
// ---------------------------------------------------------------------------

/** Inputs to the Stage 2 (Locate Astronomican) test. */
export interface LocateAstronomicanInput {
    /** Awareness characteristic (1-100). */
    readonly awareness: number;
    /** Rolled d100 (1-100). */
    readonly rolled: number;
    /** Optional situational modifier. Added to the +10 Ordinary base. */
    readonly situational?: number;
}

/** Stage 2 outcome augmented with the per-voyage Navigation modifier. */
export interface LocateAstronomicanResult extends WarpStageResult {
    /**
     * Modifier applied to every subsequent Navigation (Warp) Test on this
     * voyage. +10 per DoS, -10 per DoF. On 3+ DoF the Astronomican cannot
     * be located and Stage 4 instead uses a Hellish (-60) test.
     */
    readonly navigationModifier: number;
    /**
     * True when 3+ DoF lost the beacon — Stage 4 will require the
     * Hellish (-60) substitute test.
     */
    readonly beaconLost: boolean;
}

/** Resolve the Stage 2 (Locate Astronomican) Awareness Test. */
export function resolveLocateAstronomican(input: LocateAstronomicanInput): LocateAstronomicanResult {
    const situational = input.situational ?? 0;
    const target = input.awareness + STAGE_DIFFICULTY['locate-astronomican'] + situational;
    const { passed, degreesOfSuccess, degreesOfFailure } = resolveD100Test({ rolled: input.rolled, target });
    const navigationModifier = passed ? degreesOfSuccess * 10 : -degreesOfFailure * 10;
    const beaconLost = !passed && degreesOfFailure >= 3;
    return {
        stage: 'locate-astronomican',
        labelKey: STAGE_LABEL_KEYS['locate-astronomican'],
        status: passed ? 'success' : 'failure',
        degreesOfSuccess,
        degreesOfFailure,
        rolled: input.rolled,
        target,
        navigationModifier,
        beaconLost,
    };
}

// ---------------------------------------------------------------------------
// Stage 3 — Chart the Course
// ---------------------------------------------------------------------------

/** Inputs to the Stage 3 (Chart Course) test. */
export interface ChartCourseInput {
    /** Navigation (Warp) skill total (1-100). */
    readonly navigationWarp: number;
    /** Rolled d100 (1-100). */
    readonly rolled: number;
    /** Optional situational modifier. */
    readonly situational?: number;
}

/** Stage 3 outcome — success grants a +20 bonus on Stage 4 Encounter rolls. */
export interface ChartCourseResult extends WarpStageResult {
    /** Bonus applied to every Warp Travel Encounter roll during Stage 4. */
    readonly encounterBonus: number;
}

/** Resolve the Stage 3 (Chart Course) Navigation (Warp) Test. */
export function resolveChartCourse(input: ChartCourseInput): ChartCourseResult {
    const situational = input.situational ?? 0;
    const target = input.navigationWarp + STAGE_DIFFICULTY['chart-course'] + situational;
    const { passed, degreesOfSuccess, degreesOfFailure } = resolveD100Test({ rolled: input.rolled, target });
    return {
        stage: 'chart-course',
        labelKey: STAGE_LABEL_KEYS['chart-course'],
        status: passed ? 'success' : 'failure',
        degreesOfSuccess,
        degreesOfFailure,
        rolled: input.rolled,
        target,
        encounterBonus: passed ? 20 : 0,
    };
}

// ---------------------------------------------------------------------------
// Stage 4 — Steer the Vessel
// ---------------------------------------------------------------------------

/** Inputs to the Stage 4 (Steer Vessel) test. */
export interface SteerVesselInput {
    /** Navigation (Warp) skill total (1-100). */
    readonly navigationWarp: number;
    /** Rolled d100 (1-100). */
    readonly rolled: number;
    /** Per-voyage modifier inherited from Stage 2. */
    readonly navigationModifier: number;
    /** True when Stage 2 produced 3+ DoF (Hellish -60 substitute test). */
    readonly beaconLost: boolean;
    /** Optional per-passage difficulty (passage hazard, GM adjudication). */
    readonly situational?: number;
}

/** Stage 4 outcome — derives the per-voyage duration multiplier and off-course flag. */
export interface SteerVesselResult extends WarpStageResult {
    /**
     * Multiplier applied to the GM-set base duration to determine elapsed
     * subjective time (Table 7-3): 0.25 / 0.5 / 0.75 / 1 / 2 / 3 / 4.
     */
    readonly durationMultiplier: number;
    /**
     * True when the Navigator failed AND rolled a 9 on either d10 (the
     * "Off Course" rule, p. 185). The vessel translates into the wrong
     * system / region of space.
     */
    readonly offCourse: boolean;
}

/**
 * Compute the per-voyage duration multiplier from a stage-4 outcome (Table
 * 7-3): 3+ DoS = ×0.25, 2 DoS = ×0.5, 1 DoS = ×0.75, plain success = ×1,
 * plain failure = ×2, 1 DoF = ×3, 2+ DoF = ×4.
 */
export function durationMultiplierFor(degreesOfSuccess: number, degreesOfFailure: number): number {
    if (degreesOfSuccess >= 4) return 0.25; // 3+ Degrees of Success per Table 7-3 = "1 + 3 extra" = 4 total
    if (degreesOfSuccess === 3) return 0.5;
    if (degreesOfSuccess === 2) return 0.75;
    if (degreesOfSuccess === 1) return 1;
    if (degreesOfFailure <= 1) return 2; // Plain failure (1 DoF, since min DoF on a fail is 1)
    if (degreesOfFailure === 2) return 3;
    return 4; // 3+ DoF
}

/**
 * True when a stage-4 d100 outcome triggers the "Off Course" rule:
 * the test failed AND either d10 of the roll shows a 9. The rolled value
 * is split into tens (`Math.floor(rolled / 10)`) and units (`rolled % 10`);
 * a `0` units digit on `100` is treated as `0` (so 90, 91, ..., 99 trigger
 * via the tens digit, and 09, 19, 29, ..., 99 trigger via the units digit).
 */
export function isOffCourseRoll(rolled: number, passed: boolean): boolean {
    if (passed) return false;
    if (rolled < 1 || rolled > 100) return false;
    const tens = Math.floor(rolled / 10) % 10;
    const units = rolled % 10;
    return tens === 9 || units === 9;
}

/** Resolve the Stage 4 (Steer Vessel) Navigation (Warp) Test. */
export function resolveSteerVessel(input: SteerVesselInput): SteerVesselResult {
    const situational = input.situational ?? 0;
    // Beacon lost forces the Hellish (-60) substitute test in lieu of the
    // standard Stage 4 difficulty (0). The per-voyage navigationModifier
    // (Stage 2) does not apply when the beacon was lost — the navigator is
    // navigating blind off ancient charts.
    const base = input.beaconLost ? -60 : input.navigationModifier;
    const target = input.navigationWarp + base + situational;
    const { passed, degreesOfSuccess, degreesOfFailure } = resolveD100Test({ rolled: input.rolled, target });
    return {
        stage: 'steer-vessel',
        labelKey: STAGE_LABEL_KEYS['steer-vessel'],
        status: passed ? 'success' : 'failure',
        degreesOfSuccess,
        degreesOfFailure,
        rolled: input.rolled,
        target,
        durationMultiplier: durationMultiplierFor(degreesOfSuccess, degreesOfFailure),
        offCourse: isOffCourseRoll(input.rolled, passed),
    };
}

// ---------------------------------------------------------------------------
// Stage 5 — Leave the Warp
// ---------------------------------------------------------------------------

/** Inputs to the Stage 5 (Leave Warp) test. */
export interface LeaveWarpInput {
    /** Navigation (Warp) skill total (1-100). */
    readonly navigationWarp: number;
    /** Rolled d100 (1-100). */
    readonly rolled: number;
    /** Optional situational modifier. */
    readonly situational?: number;
}

/** Stage 5 outcome — degrees of failure encode translation deviation severity. */
export interface LeaveWarpResult extends WarpStageResult {
    /**
     * Severity of translation deviation: 0 = clean exit, 1 = minor drift,
     * 2 = significant drift, 3+ = dangerous (e.g. near planetary body).
     * Matches degrees of failure on the Hard (-20) test.
     */
    readonly deviationSeverity: number;
}

/** Resolve the Stage 5 (Leave Warp) Navigation (Warp) Test. */
export function resolveLeaveWarp(input: LeaveWarpInput): LeaveWarpResult {
    const situational = input.situational ?? 0;
    const target = input.navigationWarp + STAGE_DIFFICULTY['leave-warp'] + situational;
    const { passed, degreesOfSuccess, degreesOfFailure } = resolveD100Test({ rolled: input.rolled, target });
    return {
        stage: 'leave-warp',
        labelKey: STAGE_LABEL_KEYS['leave-warp'],
        status: passed ? 'success' : 'failure',
        degreesOfSuccess,
        degreesOfFailure,
        rolled: input.rolled,
        target,
        deviationSeverity: passed ? 0 : degreesOfFailure,
    };
}

// ---------------------------------------------------------------------------
// Perils of the Warp (Table 6-3, p. 161)
// ---------------------------------------------------------------------------

/** Stable identifiers for the canonical Perils of the Warp entries. */
type PerilId =
    | 'the-gibbering'
    | 'warp-burn'
    | 'psychic-concussion'
    | 'psy-blast'
    | 'soul-sear'
    | 'locked-in'
    | 'chronological-incontinence'
    | 'psychic-mirror'
    | 'warp-whispers'
    | 'dark-summoning'
    | 'rending-the-veil'
    | 'blood-rain'
    | 'cataclysmic-blast'
    | 'mass-possession'
    | 'reality-quake'
    | 'lost-to-the-warp'
    | 'destruction';

/** Single Perils-of-the-Warp table entry. */
export interface PerilDef {
    readonly id: PerilId;
    /** Inclusive d100 range lower bound. */
    readonly rangeMin: number;
    /** Inclusive d100 range upper bound (00 is treated as 100). */
    readonly rangeMax: number;
    /** i18n key under `WH40K.WarpTravel.Peril.<key>.Name`. */
    readonly key: string;
    /** English fallback display name. */
    readonly name: string;
    /** Short prose effect summary (English fallback). */
    readonly effect: string;
}

/** Table 6-3 — Perils of the Warp (full RT/DH d100 lookup). */
export const PERILS_OF_THE_WARP: ReadonlyArray<PerilDef> = Object.freeze([
    {
        id: 'the-gibbering',
        rangeMin: 1,
        rangeMax: 5,
        key: 'TheGibbering',
        name: 'The Gibbering',
        effect: 'Challenging Willpower test or 1d5+1 Insanity and Stunned 1d5 rounds.',
    },
    { id: 'warp-burn', rangeMin: 6, rangeMax: 9, key: 'WarpBurn', name: 'Warp Burn', effect: '1d5 Wounds and Stunned 1d5 rounds.' },
    {
        id: 'psychic-concussion',
        rangeMin: 10,
        rangeMax: 13,
        key: 'PsychicConcussion',
        name: 'Psychic Concussion',
        effect: 'Psyker unconscious 1d5 rounds; bystanders within 3d10m Routine Willpower or Stunned 1 round.',
    },
    { id: 'psy-blast', rangeMin: 14, rangeMax: 18, key: 'PsyBlast', name: 'Psy-Blast', effect: 'Psyker thrown 1d10m into the air (falling damage).' },
    { id: 'soul-sear', rangeMin: 19, rangeMax: 24, key: 'SoulSear', name: 'Soul Sear', effect: 'No psychic powers for one hour; 5 Corruption.' },
    { id: 'locked-in', rangeMin: 25, rangeMax: 30, key: 'LockedIn', name: 'Locked In', effect: 'Catatonic; each round full-action Willpower test to recover.' },
    {
        id: 'chronological-incontinence',
        rangeMin: 31,
        rangeMax: 38,
        key: 'ChronologicalIncontinence',
        name: 'Chronological Incontinence',
        effect: 'Vanishes 1d10 rounds; 1d5 Insanity and 1d5 permanent Toughness damage.',
    },
    {
        id: 'psychic-mirror',
        rangeMin: 39,
        rangeMax: 46,
        key: 'PsychicMirror',
        name: 'Psychic Mirror',
        effect: 'Power reflected on the psyker; beneficial powers deal 1d10+5 Energy ignoring non-warded armour.',
    },
    {
        id: 'warp-whispers',
        rangeMin: 47,
        rangeMax: 55,
        key: 'WarpWhispers',
        name: 'Warp Whispers',
        effect: 'Everyone within 4d10m Hard Willpower or 1d10 Corruption.',
    },
    {
        id: 'dark-summoning',
        rangeMin: 59,
        rangeMax: 67,
        key: 'DarkSummoning',
        name: 'Dark Summoning',
        effect: 'A Warp Predator manifests within 3d10m for 1d10 rounds; attacks the psyker.',
    },
    {
        id: 'rending-the-veil',
        rangeMin: 68,
        rangeMax: 72,
        key: 'RendingTheVeil',
        name: 'Rending the Veil',
        effect: 'All within 1d100m must test against Fear (3) Warp Shock for 1d5 rounds.',
    },
    {
        id: 'blood-rain',
        rangeMin: 73,
        rangeMax: 78,
        key: 'BloodRain',
        name: 'Blood Rain',
        effect: 'Within 5d10m: Challenging Strength or knocked down; further Perils auto-invoked 1d5 rounds.',
    },
    {
        id: 'cataclysmic-blast',
        rangeMin: 79,
        rangeMax: 82,
        key: 'CataclysmicBlast',
        name: 'Cataclysmic Blast',
        effect: 'Anyone within 1d10m takes 1d10+5 Energy; psyker stripped naked; no powers 1d5 hours.',
    },
    {
        id: 'mass-possession',
        rangeMin: 83,
        rangeMax: 86,
        key: 'MassPossession',
        name: 'Mass Possession',
        effect: 'All within 1d100m resist Puppet Master at 60/60/60; possession lasts 2d10 rounds.',
    },
    {
        id: 'reality-quake',
        rangeMin: 87,
        rangeMax: 90,
        key: 'RealityQuake',
        name: 'Reality Quake',
        effect: 'Within 3d10m all take 2d10 Rending; warded objects/Untouchables halve.',
    },
    {
        id: 'lost-to-the-warp',
        rangeMin: 91,
        rangeMax: 99,
        key: 'LostToTheWarp',
        name: 'Lost to the Warp',
        effect: 'Very Hard Willpower or dragged into the warp; reappear 1d10 weeks later with 4d10 Corruption.',
    },
    {
        id: 'destruction',
        rangeMin: 100,
        rangeMax: 100,
        key: 'Destruction',
        name: 'Destruction',
        effect: 'Irrevocably destroyed; 50% chance a daemonic entity takes his place.',
    },
]);

/** Find the Peril entry covering the given d100 roll (1-100; 00 → 100). */
export function getPerilForRoll(d100: number): PerilDef | null {
    const normalized = d100 === 0 ? 100 : d100;
    return PERILS_OF_THE_WARP.find((p) => normalized >= p.rangeMin && normalized <= p.rangeMax) ?? null;
}

/** Injectable RNG signature (matches `Math.random`). */
export type Rng = () => number;

/** Roll a fresh d100 and return the matching Peril. Returns null only when
 * the table has a gap (the canonical RT table has a 56-58 gap reserved for
 * "Vice Versa", which is intentionally omitted here). */
export function rollPeril(rng: Rng = Math.random): { rolled: number; peril: PerilDef | null } {
    const raw = Number(rng());
    const r = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
    const rolled = Math.floor(r * 100) + 1;
    return { rolled, peril: getPerilForRoll(rolled) };
}

// ---------------------------------------------------------------------------
// Journey composition
// ---------------------------------------------------------------------------

/** All five stage results in canonical order. */
export interface WarpJourneyResult {
    readonly duration: { readonly stage: 'duration'; readonly labelKey: string; readonly baseDays: number };
    readonly locate: LocateAstronomicanResult;
    readonly chart: ChartCourseResult;
    readonly steer: SteerVesselResult;
    readonly leave: LeaveWarpResult;
    /** Final elapsed duration in days (baseDays × Stage 4 multiplier). */
    readonly elapsedDays: number;
    /** True when Stage 4 triggered the off-course rule. */
    readonly offCourse: boolean;
    /** True when Stage 5 produced any deviation (DoF ≥ 1). */
    readonly translationDeviation: boolean;
    /** True when the Astronomican beacon was lost during Stage 2. */
    readonly beaconLost: boolean;
}

/** Inputs to a full 5-stage journey resolution. */
export interface WarpJourneyInput {
    readonly baseDays: number;
    readonly awareness: number;
    readonly navigationWarp: number;
    readonly locateRoll: number;
    readonly chartRoll: number;
    readonly steerRoll: number;
    readonly leaveRoll: number;
    readonly locateSituational?: number;
    readonly chartSituational?: number;
    readonly steerSituational?: number;
    readonly leaveSituational?: number;
}

/** Resolve a full 5-stage warp journey, given pre-rolled d100s per stage. */
export function resolveWarpJourney(input: WarpJourneyInput): WarpJourneyResult {
    const locate = resolveLocateAstronomican({
        awareness: input.awareness,
        rolled: input.locateRoll,
        ...(input.locateSituational !== undefined ? { situational: input.locateSituational } : {}),
    });
    const chart = resolveChartCourse({
        navigationWarp: input.navigationWarp,
        rolled: input.chartRoll,
        ...(input.chartSituational !== undefined ? { situational: input.chartSituational } : {}),
    });
    const steer = resolveSteerVessel({
        navigationWarp: input.navigationWarp,
        rolled: input.steerRoll,
        navigationModifier: locate.navigationModifier,
        beaconLost: locate.beaconLost,
        ...(input.steerSituational !== undefined ? { situational: input.steerSituational } : {}),
    });
    const leave = resolveLeaveWarp({
        navigationWarp: input.navigationWarp,
        rolled: input.leaveRoll,
        ...(input.leaveSituational !== undefined ? { situational: input.leaveSituational } : {}),
    });
    return {
        duration: { stage: 'duration', labelKey: STAGE_LABEL_KEYS.duration, baseDays: input.baseDays },
        locate,
        chart,
        steer,
        leave,
        elapsedDays: input.baseDays * steer.durationMultiplier,
        offCourse: steer.offCourse,
        translationDeviation: leave.deviationSeverity > 0,
        beaconLost: locate.beaconLost,
    };
}
