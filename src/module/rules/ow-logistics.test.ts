import { describe, expect, it } from 'vitest';

import {
    OW_CRAFTSMANSHIP_MODIFIER,
    OW_DEFAULT_LOGISTICS_RATING,
    OW_FRONT_ACTIVE_MOD,
    OW_MUNITORUM_INFLUENCE_BONUS,
    OW_STANDARD_KIT_BONUS,
    OW_TIME_IN_FRONT_MOD,
    OW_TROOP_COUNT_MOD,
    OW_WAR_CONDITION_MOD,
    computeLogisticsTarget,
    resolveLogisticsTest,
    type Craftsmanship,
    type FrontActive,
    type LogisticsContext,
    type TimeInFront,
    type TroopCount,
    type WarCondition,
} from './ow-logistics';

/** Neutral baseline context: default rating, no Munitorum, no situational, all axes at the
 *  tier with the smallest absolute modifier. Lands at the unmodified rating (10). */
function baseline(overrides: Partial<LogisticsContext> = {}): LogisticsContext {
    return {
        rating: OW_DEFAULT_LOGISTICS_RATING,
        munitorum: false,
        situational: 0,
        troopCount: 'company',
        timeInFront: 'weeks',
        frontActive: 'active',
        warCondition: 'standard',
        standardKit: false,
        craftsmanship: 'common',
        ...overrides,
    };
}

describe('OW Squad Logistics Rating constants', () => {
    it('default Logistics Rating is 10', () => {
        expect(OW_DEFAULT_LOGISTICS_RATING).toBe(10);
    });

    it('Munitorum Influence Talent grants +5', () => {
        expect(OW_MUNITORUM_INFLUENCE_BONUS).toBe(5);
    });

    it('Standard kit request grants +20', () => {
        expect(OW_STANDARD_KIT_BONUS).toBe(20);
    });
});

describe('computeLogisticsTarget — baseline + flat bonuses', () => {
    it('returns the bare rating when all axes are neutral', () => {
        const { target, breakdown } = computeLogisticsTarget(baseline());
        expect(target).toBe(10);
        expect(breakdown.rating).toBe(10);
        expect(breakdown.munitorum).toBe(0);
        expect(breakdown.situational).toBe(0);
        expect(breakdown.standardKit).toBe(0);
        expect(breakdown.craftsmanship).toBe(0);
    });

    it('stacks Munitorum Influence (+5)', () => {
        const { target, breakdown } = computeLogisticsTarget(baseline({ munitorum: true }));
        expect(breakdown.munitorum).toBe(5);
        expect(target).toBe(15);
    });

    it('stacks GM situational adjustment (positive)', () => {
        const { target } = computeLogisticsTarget(baseline({ situational: 5 }));
        expect(target).toBe(15);
    });

    it('stacks GM situational adjustment (negative)', () => {
        const { target } = computeLogisticsTarget(baseline({ situational: -5 }));
        expect(target).toBe(5);
    });

    it('stacks Munitorum + situational + standard kit (+5 +5 +20)', () => {
        const { target, breakdown } = computeLogisticsTarget(baseline({ munitorum: true, situational: 5, standardKit: true }));
        expect(breakdown.munitorum).toBe(5);
        expect(breakdown.situational).toBe(5);
        expect(breakdown.standardKit).toBe(20);
        expect(target).toBe(40);
    });

    it('clamps the final target to 0 (never negative)', () => {
        const { target } = computeLogisticsTarget(baseline({ rating: 5, craftsmanship: 'best', warCondition: 'desperate' }));
        // 5 + 0 + 0 + 0 + 0 + 0 + (-30) + 0 + (-50) = -75 → clamped to 0
        expect(target).toBe(0);
    });
});

describe('computeLogisticsTarget — craftsmanship axis (Table 6-6)', () => {
    const cases: ReadonlyArray<readonly [Craftsmanship, number]> = [
        ['poor', 20],
        ['common', 0],
        ['good', -30],
        ['best', -50],
    ];
    it.each(cases)('%s craftsmanship contributes %d', (craftsmanship, expected) => {
        expect(OW_CRAFTSMANSHIP_MODIFIER[craftsmanship]).toBe(expected);
        const { breakdown, target } = computeLogisticsTarget(baseline({ craftsmanship }));
        expect(breakdown.craftsmanship).toBe(expected);
        expect(target).toBe(Math.max(0, 10 + expected));
    });

    it('OW craftsmanship values differ from DH2 — Poor is +20 (not +10), Best is -50 (not -30)', () => {
        // Smoke-test the divergence note in the module docstring.
        expect(OW_CRAFTSMANSHIP_MODIFIER.poor).toBe(20);
        expect(OW_CRAFTSMANSHIP_MODIFIER.best).toBe(-50);
    });
});

describe('computeLogisticsTarget — troop count axis (Table 6-2 column)', () => {
    const cases: ReadonlyArray<readonly [TroopCount, number]> = [
        ['squad', -20],
        ['platoon', -10],
        ['company', 0],
        ['regiment', 10],
    ];
    it.each(cases)('%s contributes %d', (troopCount, expected) => {
        expect(OW_TROOP_COUNT_MOD[troopCount]).toBe(expected);
        const { breakdown, target } = computeLogisticsTarget(baseline({ troopCount }));
        expect(breakdown.troopCount).toBe(expected);
        expect(target).toBe(Math.max(0, 10 + expected));
    });
});

describe('computeLogisticsTarget — time-in-front axis', () => {
    const cases: ReadonlyArray<readonly [TimeInFront, number]> = [
        ['days', -10],
        ['weeks', 0],
        ['months', 10],
        ['years', 30],
    ];
    it.each(cases)('%s contributes %d', (timeInFront, expected) => {
        expect(OW_TIME_IN_FRONT_MOD[timeInFront]).toBe(expected);
        const { breakdown, target } = computeLogisticsTarget(baseline({ timeInFront }));
        expect(breakdown.timeInFront).toBe(expected);
        expect(target).toBe(Math.max(0, 10 + expected));
    });
});

describe('computeLogisticsTarget — front-active axis', () => {
    const cases: ReadonlyArray<readonly [FrontActive, number]> = [
        ['lull', 10],
        ['active', 0],
        ['major', -20],
    ];
    it.each(cases)('%s contributes %d', (frontActive, expected) => {
        expect(OW_FRONT_ACTIVE_MOD[frontActive]).toBe(expected);
        const { breakdown, target } = computeLogisticsTarget(baseline({ frontActive }));
        expect(breakdown.frontActive).toBe(expected);
        expect(target).toBe(Math.max(0, 10 + expected));
    });
});

describe('computeLogisticsTarget — war-condition axis', () => {
    const cases: ReadonlyArray<readonly [WarCondition, number]> = [
        ['standard', 0],
        ['hostile', -20],
        ['desperate', -30],
    ];
    it.each(cases)('%s contributes %d', (warCondition, expected) => {
        expect(OW_WAR_CONDITION_MOD[warCondition]).toBe(expected);
        const { breakdown, target } = computeLogisticsTarget(baseline({ warCondition }));
        expect(breakdown.warCondition).toBe(expected);
        expect(target).toBe(Math.max(0, 10 + expected));
    });
});

describe('computeLogisticsTarget — full worked example', () => {
    it('matches the spirit of core.md line 7088 (Mordian plasma gun)', () => {
        // Pick axes such that all four modifiers exercise simultaneously.
        // squad (-20) + months (+10) + major (-20) + hostile (-20) + standardKit (+20) + Munitorum (+5) + situational (+5) + craftsmanship best (-50)
        // = 10 + 5 + 5 + (-20) + 10 + (-20) + (-20) + 20 + (-50) = -60 → clamped 0
        const { target, breakdown } = computeLogisticsTarget(
            baseline({
                munitorum: true,
                situational: 5,
                troopCount: 'squad',
                timeInFront: 'months',
                frontActive: 'major',
                warCondition: 'hostile',
                standardKit: true,
                craftsmanship: 'best',
            }),
        );
        expect(breakdown.troopCount).toBe(-20);
        expect(breakdown.timeInFront).toBe(10);
        expect(breakdown.frontActive).toBe(-20);
        expect(breakdown.warCondition).toBe(-20);
        expect(breakdown.standardKit).toBe(20);
        expect(breakdown.craftsmanship).toBe(-50);
        expect(target).toBe(0);
    });
});

describe('resolveLogisticsTest', () => {
    it('returns success with positive DoS when roll is well below target', () => {
        const ctx = baseline({ rating: 40 });
        const result = resolveLogisticsTest(ctx, 12);
        expect(result.target).toBe(40);
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(2); // floor((40-12)/10) = 2
        expect(result.degreesOfFailure).toBe(0);
    });

    it('returns success with 0 DoS when roll equals target (boundary)', () => {
        const ctx = baseline({ rating: 40 });
        const result = resolveLogisticsTest(ctx, 40);
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(0);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('returns success with 0 DoS for a marginal success (target - 1)', () => {
        const ctx = baseline({ rating: 40 });
        const result = resolveLogisticsTest(ctx, 39);
        expect(result.success).toBe(true);
        expect(result.degreesOfSuccess).toBe(0);
    });

    it('returns failure with 0 DoF for a marginal failure (target + 1)', () => {
        const ctx = baseline({ rating: 40 });
        const result = resolveLogisticsTest(ctx, 41);
        expect(result.success).toBe(false);
        expect(result.degreesOfSuccess).toBe(0);
        expect(result.degreesOfFailure).toBe(0);
    });

    it('returns failure with positive DoF when roll is well above target', () => {
        const ctx = baseline({ rating: 40 });
        const result = resolveLogisticsTest(ctx, 73);
        expect(result.success).toBe(false);
        expect(result.degreesOfFailure).toBe(3); // floor((73-40)/10) = 3
        expect(result.degreesOfSuccess).toBe(0);
    });

    it('exposes the same breakdown as computeLogisticsTarget', () => {
        const ctx = baseline({ munitorum: true, standardKit: true, craftsmanship: 'good' });
        const direct = computeLogisticsTarget(ctx);
        const resolved = resolveLogisticsTest(ctx, 1);
        expect(resolved.target).toBe(direct.target);
        expect(resolved.breakdown).toEqual(direct.breakdown);
    });
});
