import { describe, expect, it } from 'vitest';
import { EXORCISM_MODIFIERS, getExorcismThreshold, getHostSurvivalTarget, prepareExorcismAttempt } from './exorcism';

/**
 * Exorcism ritual (#83 — beyond.md p.70). An Extended Daemonic Mastery
 * test against the possessor; threshold = 2 × daemon WP bonus. Per-
 * attempt modifiers come from the EXORCISM_MODIFIERS table. The host
 * makes a Toughness test (target = TB − 10) to survive on success.
 */

describe('EXORCISM_MODIFIERS table (#83)', () => {
    it('Sanctified Ground +20', () => {
        expect(EXORCISM_MODIFIERS.SANCTIFIED_GROUND.modifier).toBe(20);
    });
    it('Holy Relic +10', () => {
        expect(EXORCISM_MODIFIERS.HOLY_RELIC.modifier).toBe(10);
    });
    it('Priest Assist +10', () => {
        expect(EXORCISM_MODIFIERS.PRIEST_ASSIST.modifier).toBe(10);
    });
    it('Host Fights Back −20', () => {
        expect(EXORCISM_MODIFIERS.HOST_FIGHTS_BACK.modifier).toBe(-20);
    });
    it('No Ritual Tools −20', () => {
        expect(EXORCISM_MODIFIERS.NO_RITUAL_TOOLS.modifier).toBe(-20);
    });
});

describe('getExorcismThreshold (#83)', () => {
    it('returns 2 × possessor WP bonus', () => {
        expect(getExorcismThreshold(3)).toBe(6);
        expect(getExorcismThreshold(5)).toBe(10);
        expect(getExorcismThreshold(7)).toBe(14);
    });
    it('floors at 1 (cannot be zero or negative)', () => {
        expect(getExorcismThreshold(0)).toBe(1);
        expect(getExorcismThreshold(-3)).toBe(1);
    });
});

describe('prepareExorcismAttempt (#83)', () => {
    it('composes the per-attempt Daemonic Mastery target with BASE_DIFFICULTY + caller factors', () => {
        const result = prepareExorcismAttempt({
            exorcistWillpower: 50,
            factors: [EXORCISM_MODIFIERS.SANCTIFIED_GROUND],
        });
        const labels = result.breakdown.map((b) => b.label);
        expect(labels).toContain('Daemonic Mastery (base Very Hard)');
        expect(labels).toContain('Sanctified Ground');
    });
});

describe('getHostSurvivalTarget (#83)', () => {
    it('returns TB − 10', () => {
        expect(getHostSurvivalTarget(40)).toBe(30);
        expect(getHostSurvivalTarget(30)).toBe(20);
    });
    it('floors at 0', () => {
        expect(getHostSurvivalTarget(5)).toBe(0);
        expect(getHostSurvivalTarget(0)).toBe(0);
        expect(getHostSurvivalTarget(-5)).toBe(0);
    });
});
