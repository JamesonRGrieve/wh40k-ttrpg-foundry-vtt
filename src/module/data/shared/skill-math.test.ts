import { describe, expect, it } from 'vitest';
import { computeSkillTarget, untrainedSkillBase } from './skill-math.ts';

describe('untrainedSkillBase (#423)', () => {
    it('aptitude systems (DH2e) subtract a flat 20', () => {
        expect(untrainedSkillBase(40, true)).toBe(20);
        expect(untrainedSkillBase(35, true)).toBe(15);
        expect(untrainedSkillBase(0, true)).toBe(-20);
    });

    it('career systems halve the characteristic, rounded down', () => {
        expect(untrainedSkillBase(40, false)).toBe(20);
        expect(untrainedSkillBase(35, false)).toBe(17); // Math.floor(17.5)
        expect(untrainedSkillBase(41, false)).toBe(20); // Math.floor(20.5)
        expect(untrainedSkillBase(0, false)).toBe(0);
    });
});

describe('computeSkillTarget flags per rank threshold (#423)', () => {
    // rank -> [trained, plus10, plus20, plus30]
    const cases: Array<[number, [boolean, boolean, boolean, boolean]]> = [
        [0, [false, false, false, false]],
        [1, [true, false, false, false]],
        [2, [true, true, false, false]],
        [3, [true, true, true, false]],
        [4, [true, true, true, true]],
        [5, [true, true, true, true]], // above cap: all flags remain set
    ];

    for (const [rank, [trained, plus10, plus20, plus30]] of cases) {
        it(`rank ${rank} → flags ${[trained, plus10, plus20, plus30].join('/')}`, () => {
            const result = computeSkillTarget(40, rank, 0, true);
            expect(result.rank).toBe(rank);
            expect(result.trained).toBe(trained);
            expect(result.plus10).toBe(plus10);
            expect(result.plus20).toBe(plus20);
            expect(result.plus30).toBe(plus30);
        });
    }
});

describe('computeSkillTarget training-bonus ladder (#423)', () => {
    // Trained (rank >= 1) uses full charTotal (40) as the base; the ladder adds
    // rank>=4?30:rank>=3?20:rank>=2?10:0 on top.
    it('rank 1 → base only (+0)', () => {
        expect(computeSkillTarget(40, 1, 0, true).current).toBe(40);
    });
    it('rank 2 → +10', () => {
        expect(computeSkillTarget(40, 2, 0, true).current).toBe(50);
    });
    it('rank 3 → +20', () => {
        expect(computeSkillTarget(40, 3, 0, true).current).toBe(60);
    });
    it('rank 4 → +30', () => {
        expect(computeSkillTarget(40, 4, 0, true).current).toBe(70);
    });
    it('rank 5 (above cap) → capped at +30', () => {
        expect(computeSkillTarget(40, 5, 0, true).current).toBe(70);
    });
});

describe('computeSkillTarget untrained base × aptitude branch (#423)', () => {
    it('untrained aptitude system: full char − 20, no training bonus', () => {
        const result = computeSkillTarget(40, 0, 0, true);
        expect(result.current).toBe(20); // 40 - 20
        expect(result.trained).toBe(false);
    });

    it('untrained career system: half char, no training bonus', () => {
        const result = computeSkillTarget(35, 0, 0, false);
        expect(result.current).toBe(17); // Math.floor(35 / 2)
    });

    it('trained skills ignore the aptitude branch (base = full char)', () => {
        // usesAptitudes flag is irrelevant once rank > 0.
        expect(computeSkillTarget(40, 2, 0, true).current).toBe(50);
        expect(computeSkillTarget(40, 2, 0, false).current).toBe(50);
    });
});

describe('computeSkillTarget flat bonus (#423)', () => {
    it('adds the per-skill flat bonus on top of base + ladder', () => {
        // rank 3 → 40 + 20 (+20 ladder) + 5 flat = 65
        expect(computeSkillTarget(40, 3, 5, true).current).toBe(65);
    });

    it('flat bonus applies to untrained targets too', () => {
        // untrained aptitude: (40 - 20) + 5 = 25
        expect(computeSkillTarget(40, 0, 5, true).current).toBe(25);
    });

    it('negative flat bonus subtracts', () => {
        expect(computeSkillTarget(40, 1, -10, true).current).toBe(30);
    });
});

describe('computeSkillTarget end-to-end (matches pre-refactor creature/NPC values) (#423)', () => {
    it('DH2e trained veteran: WS 45, rank 4, +5 → 80', () => {
        // baseValue 45 + trainingBonus 30 + bonus 5
        expect(computeSkillTarget(45, 4, 5, true)).toEqual({
            rank: 4,
            trained: true,
            plus10: true,
            plus20: true,
            plus30: true,
            current: 80,
        });
    });

    it('DH2e untrained: Fel 30, rank 0 → 10', () => {
        expect(computeSkillTarget(30, 0, 0, true)).toEqual({
            rank: 0,
            trained: false,
            plus10: false,
            plus20: false,
            plus30: false,
            current: 10, // 30 - 20
        });
    });

    it('career untrained: Int 41, rank 0 → 20 (half, floored)', () => {
        expect(computeSkillTarget(41, 0, 0, false).current).toBe(20);
    });
});
