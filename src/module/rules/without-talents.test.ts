import { describe, expect, it } from 'vitest';
import { resolveSprayAvoidance } from './spray-avoidance';
import { resolveFieldVivisection, resolveLeapingDodge, resolvePushTheLimit, WITHOUT_TALENTS } from './without-talents';

/**
 * Per-talent contract tests for the Without novel-mechanic talent
 * helpers (#101 — without.md p. 62). Pairs the numeric constants
 * already exercised in `xenos-features.test.ts` with the runtime
 * composers that the engine consumer calls during play.
 */

describe('WITHOUT_TALENTS — namespace re-export (#101)', () => {
    it('groups the novel-mechanic talents that carry resolvers', () => {
        expect(Object.keys(WITHOUT_TALENTS).sort()).toEqual(['fieldVivisection', 'leapingDodge', 'pushTheLimit'].sort());
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
