import { describe, expect, it } from 'vitest';
import { resolveSprayAvoidance } from './spray-avoidance';
import {
    resolveFieldVivisection,
    resolveHotshotPilot,
    resolveHullDownSize,
    resolveLeapingDodge,
    resolvePushTheLimit,
    WITHOUT_TALENTS,
} from './without-talents';

/**
 * Per-talent contract tests for the Without novel-mechanic talent
 * helpers (#101 — without.md p. 62). Pairs the numeric constants
 * already exercised in `xenos-features.test.ts` with the runtime
 * composers that the engine consumer calls during play.
 */

describe('WITHOUT_TALENTS — namespace re-export (#101)', () => {
    it('groups all five novel-mechanic talents', () => {
        expect(Object.keys(WITHOUT_TALENTS).sort()).toEqual(['fieldVivisection', 'hotshotPilot', 'hullDown', 'leapingDodge', 'pushTheLimit'].sort());
    });
});

describe('Field Vivisection — Medicae substitution (#101)', () => {
    const base = {
        mode: 'melee' as const,
        isCalledShot: true,
        targetIsStudiedXenos: true,
        hasForbiddenLoreXenos: true,
        weaponSkillTotal: 42,
        medicaeTotal: 56,
    };

    it('swaps to Medicae when every precondition is met (melee)', () => {
        const result = resolveFieldVivisection(base);
        expect(result.swapped).toBe(true);
        expect(result.skill).toBe('medicae');
        expect(result.target).toBe(56);
    });

    it('uses Ballistic Skill in ranged mode when the talent does not fire', () => {
        const result = resolveFieldVivisection({ ...base, mode: 'ranged', isCalledShot: false });
        expect(result.swapped).toBe(false);
        expect(result.skill).toBe('ballisticSkill');
        expect(result.target).toBe(42);
    });

    it('blocks the swap when the target is not the studied xenos', () => {
        const result = resolveFieldVivisection({ ...base, targetIsStudiedXenos: false });
        expect(result.swapped).toBe(false);
        expect(result.skill).toBe('weaponSkill');
    });

    it('blocks the swap when Forbidden Lore (Xenos) is missing', () => {
        const result = resolveFieldVivisection({ ...base, hasForbiddenLoreXenos: false });
        expect(result.swapped).toBe(false);
    });

    it('clamps negative skill totals to 0', () => {
        const result = resolveFieldVivisection({
            ...base,
            isCalledShot: false,
            weaponSkillTotal: -5,
        });
        expect(result.target).toBe(0);
    });
});

describe('Hotshot Pilot — Fatigue trade (#101)', () => {
    it('adds AgB DoS on a successful Operate test when invoked', () => {
        const result = resolveHotshotPilot({
            success: true,
            degreesOfSuccess: 1,
            degreesOfFailure: 0,
            agilityBonus: 4,
            spendFatigue: true,
        });
        expect(result.applied).toBe(true);
        expect(result.fatigueGained).toBe(1);
        expect(result.adjustedDegreesOfSuccess).toBe(5);
        expect(result.adjustedDegreesOfFailure).toBe(0);
    });

    it('reduces DoF by AgB on failure, clamped to a minimum of 1', () => {
        const result = resolveHotshotPilot({
            success: false,
            degreesOfSuccess: 0,
            degreesOfFailure: 3,
            agilityBonus: 4,
            spendFatigue: true,
        });
        expect(result.applied).toBe(true);
        expect(result.adjustedDegreesOfFailure).toBe(1);
        expect(result.adjustedDegreesOfSuccess).toBe(0);
    });

    it('declined trade leaves DoS/DoF and Fatigue untouched', () => {
        const result = resolveHotshotPilot({
            success: true,
            degreesOfSuccess: 2,
            degreesOfFailure: 0,
            agilityBonus: 4,
            spendFatigue: false,
        });
        expect(result.applied).toBe(false);
        expect(result.fatigueGained).toBe(0);
        expect(result.adjustedDegreesOfSuccess).toBe(2);
    });

    it('zero Agility bonus disables the trade even when invoked', () => {
        const result = resolveHotshotPilot({
            success: false,
            degreesOfSuccess: 0,
            degreesOfFailure: 5,
            agilityBonus: 0,
            spendFatigue: true,
        });
        expect(result.applied).toBe(false);
        expect(result.fatigueGained).toBe(0);
        expect(result.adjustedDegreesOfFailure).toBe(5);
    });
});

describe('Hull Down — Size −1 during Movement (#101)', () => {
    it('shaves one Size tier off during a Movement action', () => {
        const result = resolveHullDownSize({ baseSize: 5, duringMovementAction: true });
        expect(result.effectiveSize).toBe(4);
        expect(result.applied).toBe(true);
    });

    it('returns the raw Size outside Movement actions', () => {
        const result = resolveHullDownSize({ baseSize: 5, duringMovementAction: false });
        expect(result.effectiveSize).toBe(5);
        expect(result.applied).toBe(false);
    });

    it('clamps effective Size to a minimum of 1 (no invisible vehicles)', () => {
        const result = resolveHullDownSize({ baseSize: 1, duringMovementAction: true });
        expect(result.effectiveSize).toBe(1);
        expect(result.applied).toBe(true);
    });
});

describe('Leaping Dodge — composes with #103 spray-avoidance (#101)', () => {
    it('forwards to Dodge when the talent is present', () => {
        const result = resolveLeapingDodge({
            hasLeapingDodge: true,
            agilityTotal: 35,
            dodgeTotal: 52,
        });
        expect(result.skill).toBe('dodge');
        expect(result.target).toBe(52);
    });

    it('falls back to Agility without the talent (identical to spray-avoidance)', () => {
        const input = { hasLeapingDodge: false, agilityTotal: 35, dodgeTotal: 52 };
        expect(resolveLeapingDodge(input)).toEqual(resolveSprayAvoidance(input));
    });
});

describe('Push the Limit — +20 Operate / 4+ DoF crit (#101)', () => {
    it('applies +20 when invoked and not yet used this round', () => {
        const result = resolvePushTheLimit({
            invoke: true,
            alreadyUsedThisRound: false,
            rawDegrees: 1,
            success: true,
            livingMount: false,
        });
        expect(result.invoked).toBe(true);
        expect(result.modifier).toBe(20);
        expect(result.triggersCritical).toBe(false);
        expect(result.criticalTable).toBeNull();
    });

    it('does NOT re-apply the bonus when the once-per-round cap has been spent', () => {
        const result = resolvePushTheLimit({
            invoke: true,
            alreadyUsedThisRound: true,
            rawDegrees: 1,
            success: true,
            livingMount: false,
        });
        expect(result.invoked).toBe(false);
        expect(result.modifier).toBe(0);
    });

    it('triggers a Motive Systems critical on 4+ DoF for vehicles', () => {
        const result = resolvePushTheLimit({
            invoke: true,
            alreadyUsedThisRound: false,
            rawDegrees: 4,
            success: false,
            livingMount: false,
        });
        expect(result.triggersCritical).toBe(true);
        expect(result.criticalTable).toBe('motive-systems');
    });

    it('routes to the Impact Leg crit table for living mounts', () => {
        const result = resolvePushTheLimit({
            invoke: true,
            alreadyUsedThisRound: false,
            rawDegrees: 5,
            success: false,
            livingMount: true,
        });
        expect(result.triggersCritical).toBe(true);
        expect(result.criticalTable).toBe('impact-leg');
    });

    it('does not trigger a crit when DoF is below the threshold', () => {
        const result = resolvePushTheLimit({
            invoke: true,
            alreadyUsedThisRound: false,
            rawDegrees: 3,
            success: false,
            livingMount: false,
        });
        expect(result.triggersCritical).toBe(false);
        expect(result.criticalTable).toBeNull();
    });

    it('does not trigger a crit when the talent was not invoked', () => {
        const result = resolvePushTheLimit({
            invoke: false,
            alreadyUsedThisRound: false,
            rawDegrees: 6,
            success: false,
            livingMount: false,
        });
        expect(result.invoked).toBe(false);
        expect(result.triggersCritical).toBe(false);
    });
});
