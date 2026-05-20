import { describe, expect, it } from 'vitest';
import type { HordeTrait } from '../data/actor/mixins/horde-template.ts';
import {
    applyHordeTraits,
    blastHitsForBlastValue,
    bonusDamageDiceForMagnitude,
    flameHitsForRange,
    getHordeTier,
    HORDE_DAMAGE_BONUS_DIE_CAP,
    HORDE_MAGNITUDE_TIERS,
    magnitudeLossForHit,
    meleeHitsForDoS,
    psychicHitsForPsyRating,
    resolveBreakCheck,
    toHitBonusForMagnitude,
} from './dw-horde-magnitude';

/**
 * RAW Horde / Magnitude resolver tests (#166 — core.md p. 359-360).
 *
 * Mental-math style: every literal assertion is grounded in a single
 * RAW citation and a hand-checked value, so failures fingerprint to a
 * specific rule rather than a vague "math drifted".
 */
describe('TABLE 13-1 — Horde Magnitude tiers (#166)', () => {
    it('exposes the four canonical tiers in ascending order', () => {
        expect(HORDE_MAGNITUDE_TIERS).toHaveLength(4);
        const labels = HORDE_MAGNITUDE_TIERS.map((t) => t.sizeKeyword);
        expect(labels).toEqual(['Massive', 'Immense', 'Monumental', 'Titanic']);
    });

    it('Magnitude 30 — Mob / Massive / +30 to hit', () => {
        const tier = getHordeTier(30);
        expect(tier.sizeKeyword).toBe('Massive');
        expect(tier.toHitBonus).toBe(30);
        expect(tier.descriptor).toBe('A mob');
        expect(toHitBonusForMagnitude(30)).toBe(30);
    });

    it('Magnitude 60 — Thronged phalanx / Immense / +40 to hit', () => {
        const tier = getHordeTier(60);
        expect(tier.sizeKeyword).toBe('Immense');
        expect(tier.toHitBonus).toBe(40);
        expect(toHitBonusForMagnitude(60)).toBe(40);
    });

    it('Magnitude 90 — Massed assault / Monumental / +50 to hit', () => {
        const tier = getHordeTier(90);
        expect(tier.sizeKeyword).toBe('Monumental');
        expect(tier.toHitBonus).toBe(50);
        expect(toHitBonusForMagnitude(90)).toBe(50);
    });

    it('Magnitude 120 — Serried tide / Titanic / +60 to hit', () => {
        const tier = getHordeTier(120);
        expect(tier.sizeKeyword).toBe('Titanic');
        expect(tier.toHitBonus).toBe(60);
        expect(toHitBonusForMagnitude(120)).toBe(60);
    });

    it('Magnitude 200 (over-cap) stays Titanic / +60', () => {
        expect(toHitBonusForMagnitude(200)).toBe(60);
    });

    it('Magnitude just-below thresholds keep the lower tier', () => {
        expect(getHordeTier(59).sizeKeyword).toBe('Massive');
        expect(getHordeTier(89).sizeKeyword).toBe('Immense');
        expect(getHordeTier(119).sizeKeyword).toBe('Monumental');
    });

    it('non-finite / negative Magnitude falls back to mob tier', () => {
        expect(getHordeTier(Number.NaN).sizeKeyword).toBe('Massive');
        expect(getHordeTier(-5).sizeKeyword).toBe('Massive');
    });
});

describe('Damage caused by hordes (#166 — +d10 per 10 Magnitude, cap +2d10)', () => {
    it('Magnitude < 10 → 0 bonus dice', () => {
        expect(bonusDamageDiceForMagnitude(9)).toBe(0);
        expect(bonusDamageDiceForMagnitude(0)).toBe(0);
    });
    it('Magnitude 10 → +1d10', () => {
        expect(bonusDamageDiceForMagnitude(10)).toBe(1);
    });
    it('Magnitude 25 (book example) → +2d10 (capped)', () => {
        // RAW: a Magnitude 25 horde adds 2d10 to its weapon's base damage.
        expect(bonusDamageDiceForMagnitude(25)).toBe(2);
    });
    it('Magnitude 100 → +2d10 (capped, not +10)', () => {
        expect(bonusDamageDiceForMagnitude(100)).toBe(HORDE_DAMAGE_BONUS_DIE_CAP);
    });
    it('negative / NaN → 0 bonus dice', () => {
        expect(bonusDamageDiceForMagnitude(-3)).toBe(0);
        expect(bonusDamageDiceForMagnitude(Number.NaN)).toBe(0);
    });
});

describe('magnitudeLossForHit — each damaging hit removes 1 (Explosive +1)', () => {
    it('a hit that did damage removes 1 Magnitude', () => {
        expect(magnitudeLossForHit(7, false)).toBe(1);
    });
    it('a hit that did 0 damage removes 0 Magnitude', () => {
        expect(magnitudeLossForHit(0, false)).toBe(0);
        expect(magnitudeLossForHit(-3, false)).toBe(0);
    });
    it('Explosive hits remove 2 (extra hit per RAW)', () => {
        expect(magnitudeLossForHit(1, true)).toBe(2);
        expect(magnitudeLossForHit(20, true)).toBe(2);
    });
    it('Explosive but 0 damage still removes 0', () => {
        expect(magnitudeLossForHit(0, true)).toBe(0);
    });
});

describe('meleeHitsForDoS — 1 hit per 2 DoS, +1 for Power Field', () => {
    it('0 / 1 DoS → 0 hits', () => {
        expect(meleeHitsForDoS(0)).toBe(0);
        expect(meleeHitsForDoS(1)).toBe(0);
    });
    it('2 DoS → 1 hit', () => {
        expect(meleeHitsForDoS(2)).toBe(1);
    });
    it('3 DoS → 1 hit (floor)', () => {
        expect(meleeHitsForDoS(3)).toBe(1);
    });
    it('4 DoS → 2 hits', () => {
        expect(meleeHitsForDoS(4)).toBe(2);
    });
    it('5 DoS → 2 hits (floor)', () => {
        expect(meleeHitsForDoS(5)).toBe(2);
    });
    it('Power Field adds +1 when at least 1 base hit lands', () => {
        expect(meleeHitsForDoS(2, true)).toBe(2);
        expect(meleeHitsForDoS(5, true)).toBe(3);
    });
    it('Power Field does NOT add on a 0-hit miss', () => {
        expect(meleeHitsForDoS(1, true)).toBe(0);
    });
});

describe('blastHitsForBlastValue — Blast (X) auto-hits X times', () => {
    it('Blast (3) → 3 hits', () => {
        expect(blastHitsForBlastValue(3)).toBe(3);
    });
    it('Blast (4) — book example → 4 hits', () => {
        expect(blastHitsForBlastValue(4)).toBe(4);
    });
    it('Blast (0) / non-blast → 0 hits', () => {
        expect(blastHitsForBlastValue(0)).toBe(0);
        expect(blastHitsForBlastValue(-1)).toBe(0);
    });
});

describe('flameHitsForRange — ceil(range/4) + 1d5', () => {
    it('range 10 + d5 of 3 → 3 + 3 = 6 hits (book example range 10, 1d5+3)', () => {
        // Book example: "a flame weapon with a range of 10 will hit a Horde
        // 1d5+3 times." For a rolled 3 the total is 6.
        expect(flameHitsForRange(10, 3)).toBe(6);
    });
    it('range 20 + d5 of 1 → 5 + 1 = 6 hits', () => {
        expect(flameHitsForRange(20, 1)).toBe(6);
    });
    it('range 1 + d5 of 5 → 1 + 5 = 6 hits (ceil(1/4) = 1)', () => {
        expect(flameHitsForRange(1, 5)).toBe(6);
    });
    it('clamps d5 into 1..5', () => {
        expect(flameHitsForRange(4, 0)).toBe(1 + 1);
        expect(flameHitsForRange(4, 7)).toBe(1 + 5);
    });
});

describe('psychicHitsForPsyRating — Psy Rating hits, +1d10 if area', () => {
    it('Psy Rating 4, no area → 4 hits', () => {
        expect(psychicHitsForPsyRating(4)).toBe(4);
    });
    it('Psy Rating 4, area d10 of 7 → 11 hits', () => {
        expect(psychicHitsForPsyRating(4, 7)).toBe(11);
    });
    it('Psy Rating 0 → 0 hits even with area', () => {
        expect(psychicHitsForPsyRating(0, 8)).toBe(0);
    });
});

describe('resolveBreakCheck — 25% / 50% / 25% thresholds', () => {
    it('no-test when nothing was lost this turn', () => {
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 30, lostThisTurn: 0, isFearless: false });
        expect(result.requiresTest).toBe(false);
        expect(result.autoBreaks).toBe(false);
        expect(result.outcome).toBe('no-test');
    });
    it('25% lost-in-turn triggers a normal test (still ≥ 50% current)', () => {
        // 30 → 22 in one turn (lost 8, ≥ 25% of 30). Still ≥ 50% (15) of starting.
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 22, lostThisTurn: 8, isFearless: false });
        expect(result.outcome).toBe('test-normal');
        expect(result.willpowerModifier).toBe(0);
        expect(result.requiresTest).toBe(true);
    });
    it('below 50% → -10 to Willpower', () => {
        // 30 → 14 in one turn, current is < 50% (15) of 30 but > 25% (7.5).
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 14, lostThisTurn: 16, isFearless: false });
        expect(result.outcome).toBe('test-penalised');
        expect(result.willpowerModifier).toBe(-10);
        expect(result.requiresTest).toBe(true);
    });
    it('below 25% → auto-break (no test)', () => {
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 6, lostThisTurn: 24, isFearless: false });
        expect(result.outcome).toBe('auto-break');
        expect(result.autoBreaks).toBe(true);
        expect(result.requiresTest).toBe(false);
    });
    it('Fearless trait never tests', () => {
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 1, lostThisTurn: 29, isFearless: true });
        expect(result.outcome).toBe('no-test');
        expect(result.requiresTest).toBe(false);
        expect(result.autoBreaks).toBe(false);
    });
    it('Disciplined ignores the -10 penalty', () => {
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 14, lostThisTurn: 16, isFearless: false, isDisciplined: true });
        expect(result.outcome).toBe('test-normal');
        expect(result.willpowerModifier).toBe(0);
    });
    it('Disciplined does not auto-break below 25%', () => {
        // Disciplined: still must test, but at no penalty and no auto-break.
        const result = resolveBreakCheck({ startingMagnitude: 30, currentMagnitude: 6, lostThisTurn: 24, isFearless: false, isDisciplined: true });
        expect(result.autoBreaks).toBe(false);
        expect(result.outcome).toBe('test-normal');
    });
});

describe('applyHordeTraits — trait hooks (#166)', () => {
    it('Overwhelming adds +1d10 in melee at Magnitude ≥ 20', () => {
        const traits = new Set<HordeTrait>(['overwhelming']);
        const result = applyHordeTraits(traits, { magnitude: 25, isMelee: true, isCharge: false, overwhelmingD10: 6 });
        expect(result.traitBonusDamage).toBe(6);
        expect(result.firedTraits).toEqual(['overwhelming']);
    });
    it('Overwhelming does NOT fire below Magnitude 20', () => {
        const traits = new Set<HordeTrait>(['overwhelming']);
        const result = applyHordeTraits(traits, { magnitude: 19, isMelee: true, isCharge: false, overwhelmingD10: 9 });
        expect(result.traitBonusDamage).toBe(0);
        expect(result.firedTraits).toEqual([]);
    });
    it('Overwhelming does NOT fire on ranged attacks', () => {
        const traits = new Set<HordeTrait>(['overwhelming']);
        const result = applyHordeTraits(traits, { magnitude: 25, isMelee: false, isCharge: false, overwhelmingD10: 8 });
        expect(result.traitBonusDamage).toBe(0);
    });
    it('Brutal Charge adds +1d10 on the charge round', () => {
        const traits = new Set<HordeTrait>(['brutal-charge']);
        const result = applyHordeTraits(traits, { magnitude: 10, isMelee: true, isCharge: true, chargingD10: 4 });
        expect(result.traitBonusDamage).toBe(4);
        expect(result.firedTraits).toEqual(['brutal-charge']);
    });
    it('no traits → no bonus', () => {
        const result = applyHordeTraits(new Set<HordeTrait>(), { magnitude: 30, isMelee: true, isCharge: true });
        expect(result.traitBonusDamage).toBe(0);
        expect(result.firedTraits).toEqual([]);
    });
});
