import { describe, expect, it } from 'vitest';
import {
    corruptionBonus,
    EXORCISM_MODIFIER_ORDER,
    EXORCISM_MODIFIERS,
    getExorcismThreshold,
    getHostSurvivalTarget,
    isExorcismComplete,
    loreBonusFactor,
    prepareExorcismAttempt,
    prepareExorcismLoreTest,
    startExorcism,
    stepExorcism,
} from './exorcism';

/** Exorcism (#83 — DH2 Enemies Beyond p. 71). */
describe('Table 2–21: Exorcism Modifiers', () => {
    it('matches the printed values', () => {
        expect(EXORCISM_MODIFIERS.SELF_EXORCISM.modifier).toBe(-10);
        expect(EXORCISM_MODIFIERS.NO_PROPER_TOOLS.modifier).toBe(-10);
        expect(EXORCISM_MODIFIERS.HIGHER_INFLUENCE.modifier).toBe(-10);
        expect(EXORCISM_MODIFIERS.WEAK_VEIL.modifier).toBe(-10);
        expect(EXORCISM_MODIFIERS.SACRED_GROUND.modifier).toBe(10);
        expect(EXORCISM_MODIFIERS.PATRON_SERVANT.modifier).toBe(10);
        expect(EXORCISM_MODIFIERS.TRUE_NAME.modifier).toBe(30);
    });

    it('lists every row once in printed order', () => {
        expect([...EXORCISM_MODIFIER_ORDER].sort()).toEqual(Object.keys(EXORCISM_MODIFIERS).sort());
    });

    it('lore preparation grants +5 per degree of success', () => {
        expect(loreBonusFactor(3).modifier).toBe(15);
        expect(loreBonusFactor(-2).modifier).toBe(0);
    });
});

describe('getExorcismThreshold', () => {
    it('is the Daemon WP bonus plus the possessed Corruption bonus (regression: was 2 × WPB)', () => {
        expect(getExorcismThreshold(5, 3)).toBe(8);
        expect(getExorcismThreshold(0, 0)).toBe(0);
    });

    it('must be exceeded, not met', () => {
        expect(isExorcismComplete(8, 8)).toBe(false);
        expect(isExorcismComplete(9, 8)).toBe(true);
    });

    it('derives the Corruption bonus from the tens digit', () => {
        expect(corruptionBonus(37)).toBe(3);
        expect(corruptionBonus(9)).toBe(0);
    });
});

describe('prepareExorcismLoreTest / prepareExorcismAttempt', () => {
    it('the lore test is Challenging (+0)', () => {
        expect(prepareExorcismLoreTest(45).target).toBe(45);
    });

    it('composes WP − 30 + lore bonus + table rows with provenance', () => {
        const r = prepareExorcismAttempt({ exorcistWillpower: 50, loreDos: 2, factors: [EXORCISM_MODIFIERS.SACRED_GROUND, EXORCISM_MODIFIERS.WEAK_VEIL] });
        expect(r.target).toBe(50 - 30 + 10 + 10 - 10);
        expect(r.components.map((c) => c.id)).toEqual(['base-difficulty', 'lore-preparation', 'sacred-ground', 'weak-veil']);
    });
});

describe('stepExorcism', () => {
    const begin = (fatigueThreshold = 3, startingFatigue = 0): ReturnType<typeof startExorcism> =>
        startExorcism({ threshold: 2, attemptTarget: 40, startingFatigue, fatigueThreshold });

    it('accumulates DoS until the threshold is exceeded', () => {
        let s = begin();
        s = stepExorcism(s, 30, 2); // 2 DoS
        expect(s.status).toBe('in-progress');
        s = stepExorcism(s, 40, 1); // 1 DoS → 3 > 2
        expect(s.status).toBe('banished');
        expect(s.totalDos).toBe(3);
        expect(s.hours).toBe(3);
    });

    it('failure costs 1 Fatigue per degree of failure', () => {
        const s = stepExorcism(begin(), 61, 4); // 3 DoF
        expect(s.fatigueGained).toBe(3);
        expect(s.attempts[0]?.fatigue).toBe(3);
        expect(s.status).toBe('in-progress');
    });

    it('collapses when Fatigue passes the exorcist threshold', () => {
        const s = stepExorcism(begin(3, 1), 61, 4); // 1 + 3 > 3
        expect(s.status).toBe('collapsed');
    });

    it('ignores further rolls once settled', () => {
        const collapsed = stepExorcism(begin(0), 99, 1);
        expect(stepExorcism(collapsed, 1, 1)).toBe(collapsed);
    });
});

describe('getHostSurvivalTarget', () => {
    it('is a Challenging (+0) Toughness test (regression: was T − 10)', () => {
        expect(getHostSurvivalTarget(40)).toBe(40);
        expect(getHostSurvivalTarget(-5)).toBe(0);
    });
});
