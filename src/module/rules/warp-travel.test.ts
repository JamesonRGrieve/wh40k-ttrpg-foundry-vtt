import { describe, expect, it } from 'vitest';
import {
    durationMultiplierFor,
    isOffCourseRoll,
    isWarpTravelAvailable,
    parsePerilText,
    resolveChartCourse,
    resolveD100Test,
    resolveLeaveWarp,
    resolveLocateAstronomican,
    resolveSteerVessel,
    resolveWarpJourney,
    STAGE_DIFFICULTY,
    STAGE_LABEL_KEYS,
} from './warp-travel';

describe('isWarpTravelAvailable (#193)', () => {
    it('returns true for rt', () => {
        expect(isWarpTravelAvailable('rt')).toBe(true);
    });

    it('returns false for non-RT systems', () => {
        for (const id of ['dh1', 'dh2', 'bc', 'dw', 'ow', 'im'] as const) {
            expect(isWarpTravelAvailable(id)).toBe(false);
        }
    });
});

describe('STAGE_DIFFICULTY (#193)', () => {
    it('matches the canonical RAW modifiers', () => {
        expect(STAGE_DIFFICULTY['locate-astronomican']).toBe(10); // Ordinary (+10)
        expect(STAGE_DIFFICULTY['chart-course']).toBe(10); // Ordinary (+10)
        expect(STAGE_DIFFICULTY['steer-vessel']).toBe(0); // Challenging baseline
        expect(STAGE_DIFFICULTY['leave-warp']).toBe(-20); // Hard (-20)
    });
});

describe('STAGE_LABEL_KEYS (#193)', () => {
    it('exposes a key for every canonical stage', () => {
        expect(STAGE_LABEL_KEYS.duration).toBe('WH40K.WarpTravel.Stage.Duration');
        expect(STAGE_LABEL_KEYS['locate-astronomican']).toBe('WH40K.WarpTravel.Stage.LocateAstronomican');
        expect(STAGE_LABEL_KEYS['chart-course']).toBe('WH40K.WarpTravel.Stage.ChartCourse');
        expect(STAGE_LABEL_KEYS['steer-vessel']).toBe('WH40K.WarpTravel.Stage.SteerVessel');
        expect(STAGE_LABEL_KEYS['leave-warp']).toBe('WH40K.WarpTravel.Stage.LeaveWarp');
    });
});

describe('resolveD100Test (#193)', () => {
    it('counts at least 1 DoS on a bare pass (rolled == target)', () => {
        const r = resolveD100Test({ rolled: 50, target: 50 });
        expect(r.passed).toBe(true);
        expect(r.degreesOfSuccess).toBe(1);
        expect(r.degreesOfFailure).toBe(0);
    });

    it('counts DoS = floor((target - rolled) / 10) + 1', () => {
        const r = resolveD100Test({ rolled: 10, target: 50 });
        // floor((50-10)/10) + 1 = 4 + 1 = 5
        expect(r.passed).toBe(true);
        expect(r.degreesOfSuccess).toBe(5);
    });

    it('counts at least 1 DoF on a bare fail (rolled == target+1)', () => {
        const r = resolveD100Test({ rolled: 51, target: 50 });
        expect(r.passed).toBe(false);
        expect(r.degreesOfFailure).toBe(1);
        expect(r.degreesOfSuccess).toBe(0);
    });

    it('counts DoF = floor((rolled - target) / 10) + 1', () => {
        const r = resolveD100Test({ rolled: 70, target: 50 });
        // floor((70-50)/10) + 1 = 2 + 1 = 3
        expect(r.passed).toBe(false);
        expect(r.degreesOfFailure).toBe(3);
    });
});

describe('resolveLocateAstronomican (#193)', () => {
    it('rolled=20 vs Aw 40 (+10) → 4 DoS, +40 nav modifier', () => {
        const r = resolveLocateAstronomican({ awareness: 40, rolled: 20 });
        // target = 40 + 10 = 50. rolled=20 → DoS = floor(30/10)+1 = 4. navMod = 40.
        expect(r.status).toBe('success');
        expect(r.target).toBe(50);
        expect(r.degreesOfSuccess).toBe(4);
        expect(r.navigationModifier).toBe(40);
        expect(r.beaconLost).toBe(false);
    });

    it('rolled=75 vs Aw 30 (+10) → 4 DoF, beacon lost', () => {
        const r = resolveLocateAstronomican({ awareness: 30, rolled: 75 });
        // target = 40. rolled=75 → DoF = floor(35/10)+1 = 4. beaconLost (>= 3).
        expect(r.status).toBe('failure');
        expect(r.degreesOfFailure).toBe(4);
        expect(r.navigationModifier).toBe(-40);
        expect(r.beaconLost).toBe(true);
    });

    it('honours situational modifier in the target', () => {
        const r = resolveLocateAstronomican({ awareness: 40, rolled: 50, situational: 10 });
        // target = 40 + 10 + 10 = 60. rolled=50 → DoS = floor(10/10)+1 = 2.
        expect(r.target).toBe(60);
        expect(r.degreesOfSuccess).toBe(2);
        expect(r.navigationModifier).toBe(20);
    });
});

describe('resolveChartCourse (#193)', () => {
    it('passing grants +20 encounter bonus; failing grants 0', () => {
        const pass = resolveChartCourse({ navigationWarp: 40, rolled: 30 });
        // target = 50. 30 ≤ 50 → success.
        expect(pass.status).toBe('success');
        expect(pass.encounterBonus).toBe(20);

        const fail = resolveChartCourse({ navigationWarp: 30, rolled: 80 });
        // target = 40. 80 > 40 → failure.
        expect(fail.status).toBe('failure');
        expect(fail.encounterBonus).toBe(0);
    });
});

describe('durationMultiplierFor (#193 / Table 7-3)', () => {
    it('matches the canonical 7-bucket table', () => {
        expect(durationMultiplierFor(4, 0)).toBe(0.25); // 3+ DoS (≥ 4 total DoS)
        expect(durationMultiplierFor(3, 0)).toBe(0.5); // 2 DoS
        expect(durationMultiplierFor(2, 0)).toBe(0.75); // 1 DoS
        expect(durationMultiplierFor(1, 0)).toBe(1); // bare success
        expect(durationMultiplierFor(0, 1)).toBe(2); // bare failure
        expect(durationMultiplierFor(0, 2)).toBe(3); // 1 DoF
        expect(durationMultiplierFor(0, 3)).toBe(4); // 2+ DoF
        expect(durationMultiplierFor(0, 9)).toBe(4); // cap at 4
    });
});

describe('isOffCourseRoll (#193)', () => {
    it('triggers on a 9 in either d10 of a failure', () => {
        expect(isOffCourseRoll(99, false)).toBe(true); // both d10s show 9
        expect(isOffCourseRoll(90, false)).toBe(true); // tens d10 = 9
        expect(isOffCourseRoll(29, false)).toBe(true); // units d10 = 9
        expect(isOffCourseRoll(91, false)).toBe(true); // tens d10 = 9
    });

    it('does not trigger on passes, or non-9 rolls', () => {
        expect(isOffCourseRoll(99, true)).toBe(false); // passed
        expect(isOffCourseRoll(45, false)).toBe(false); // no 9
        expect(isOffCourseRoll(88, false)).toBe(false); // no 9
    });
});

describe('resolveSteerVessel (#193)', () => {
    it('applies the Stage-2 navigation modifier to the target', () => {
        const r = resolveSteerVessel({
            navigationWarp: 45,
            rolled: 30,
            navigationModifier: 20,
            beaconLost: false,
        });
        // target = 45 + 20 + 0 = 65. rolled=30 → DoS = floor(35/10)+1 = 4. mult = 0.25.
        expect(r.target).toBe(65);
        expect(r.status).toBe('success');
        expect(r.degreesOfSuccess).toBe(4);
        expect(r.durationMultiplier).toBe(0.25);
        expect(r.offCourse).toBe(false);
    });

    it('triggers off-course when a failure rolls a 9 in either d10', () => {
        const r = resolveSteerVessel({
            navigationWarp: 40,
            rolled: 99,
            navigationModifier: 0,
            beaconLost: false,
        });
        // target = 40. rolled=99 → fail, DoF = floor(59/10)+1 = 6. mult cap = 4. offCourse=true.
        expect(r.status).toBe('failure');
        expect(r.degreesOfFailure).toBe(6);
        expect(r.durationMultiplier).toBe(4);
        expect(r.offCourse).toBe(true);
    });

    it('substitutes a Hellish (-60) target when the beacon is lost', () => {
        const r = resolveSteerVessel({
            navigationWarp: 50,
            rolled: 10,
            navigationModifier: 20, // ignored when beaconLost
            beaconLost: true,
        });
        // target = 50 + (-60) + 0 = -10. rolled=10 > -10 → fail. DoF = floor(20/10)+1 = 3.
        expect(r.target).toBe(-10);
        expect(r.status).toBe('failure');
        expect(r.degreesOfFailure).toBe(3);
    });
});

describe('resolveLeaveWarp (#193)', () => {
    it('encodes deviation severity as DoF on a Hard (-20) test', () => {
        const clean = resolveLeaveWarp({ navigationWarp: 50, rolled: 30 });
        // target = 50 + (-20) = 30. rolled=30 ≤ 30 → success. deviation=0.
        expect(clean.status).toBe('success');
        expect(clean.target).toBe(30);
        expect(clean.deviationSeverity).toBe(0);

        const drift = resolveLeaveWarp({ navigationWarp: 40, rolled: 50 });
        // target = 20. rolled=50 → fail, DoF = floor(30/10)+1 = 4.
        expect(drift.status).toBe('failure');
        expect(drift.deviationSeverity).toBe(4);
    });
});

describe('parsePerilText (#193)', () => {
    it('splits a bold-led entry (the authored `<b>name</b>: effect` form) into name and effect', () => {
        const r = parsePerilText('<p><b>The Gibbering</b>: Challenging Willpower test or 1d5+1 Insanity and Stunned 1d5 rounds.</p>');
        expect(r.name).toBe('The Gibbering');
        expect(r.effect).toBe('Challenging Willpower test or 1d5+1 Insanity and Stunned 1d5 rounds.');
    });

    it('accepts <strong> as the name delimiter and an em-dash separator', () => {
        const r = parsePerilText('<p><strong>Destruction</strong> — Irrevocably destroyed; 50% chance a daemonic entity takes his place.</p>');
        expect(r.name).toBe('Destruction');
        expect(r.effect).toBe('Irrevocably destroyed; 50% chance a daemonic entity takes his place.');
    });

    it('strips inline markup inside the effect prose', () => {
        const r = parsePerilText('<p><b>Warp Burn</b>: 1d5 <em>Wounds</em> and Stunned 1d5 rounds.</p>');
        expect(r.name).toBe('Warp Burn');
        expect(r.effect).toBe('1d5 Wounds and Stunned 1d5 rounds.');
    });

    it('falls back to the stripped text as the name (empty effect) when no bold run is present', () => {
        const r = parsePerilText('<p>Unnamed peril</p>');
        expect(r.name).toBe('Unnamed peril');
        expect(r.effect).toBe('');
    });
});

describe('resolveWarpJourney (#193)', () => {
    it('composes all 5 stages and computes elapsed days from baseDays × steer multiplier', () => {
        // Stage 2: Aw 40, rolled 20 → target 50, DoS=4, navMod +40, beacon kept.
        // Stage 3: NavWarp 40, rolled 30 → target 50, success (encounter bonus +20).
        // Stage 4: NavWarp 40, rolled 30, navMod +40 → target 80. rolled=30 →
        //          DoS = floor((80-30)/10)+1 = 5+1 = 6, mult=0.25.
        // Stage 5 (Hard -20): NavWarp 40, rolled 10 → target 20. rolled=10 →
        //          DoS = floor((20-10)/10)+1 = 1+1 = 2, success, deviation 0.
        const journey = resolveWarpJourney({
            baseDays: 40,
            awareness: 40,
            navigationWarp: 40,
            locateRoll: 20,
            chartRoll: 30,
            steerRoll: 30,
            leaveRoll: 10,
        });
        expect(journey.locate.status).toBe('success');
        expect(journey.locate.beaconLost).toBe(false);
        expect(journey.chart.status).toBe('success');
        expect(journey.chart.encounterBonus).toBe(20);
        expect(journey.steer.status).toBe('success');
        expect(journey.steer.durationMultiplier).toBe(0.25);
        expect(journey.elapsedDays).toBe(10); // 40 × 0.25
        expect(journey.offCourse).toBe(false);
        expect(journey.beaconLost).toBe(false);
        expect(journey.leave.status).toBe('success');
        expect(journey.translationDeviation).toBe(false);
    });

    it('flags an off-course steer + translation deviation when stages 4 and 5 fail', () => {
        // Stage 2: Aw 30, rolled 35 → target 40, 35 ≤ 40 → success, DoS=1, navMod +10. beaconLost false.
        // Stage 4: NavWarp 40, rolled 99, navMod +10 → target 50. rolled=99 → fail. offCourse=true.
        // Stage 5: NavWarp 40, rolled 80 → target 20 → fail. DoF=floor(60/10)+1=7 → deviation 7.
        const journey = resolveWarpJourney({
            baseDays: 30,
            awareness: 30,
            navigationWarp: 40,
            locateRoll: 35,
            chartRoll: 30,
            steerRoll: 99,
            leaveRoll: 80,
        });
        expect(journey.offCourse).toBe(true);
        expect(journey.translationDeviation).toBe(true);
        expect(journey.leave.deviationSeverity).toBeGreaterThan(0);
    });

    it('propagates beaconLost from Stage 2 into Stage 4 target math', () => {
        // Stage 2: Aw 30, rolled 75 → target 40 → fail, DoF=4 → beaconLost true.
        // Stage 4: NavWarp 60, rolled 10, beaconLost=true → target = 60 + (-60) = 0. rolled=10 → fail.
        const journey = resolveWarpJourney({
            baseDays: 20,
            awareness: 30,
            navigationWarp: 60,
            locateRoll: 75,
            chartRoll: 30,
            steerRoll: 10,
            leaveRoll: 30,
        });
        expect(journey.beaconLost).toBe(true);
        expect(journey.steer.target).toBe(0);
        expect(journey.steer.status).toBe('failure');
    });
});
