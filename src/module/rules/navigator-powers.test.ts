import { describe, expect, it } from 'vitest';
import {
    NAVIGATOR_LEVEL_BONUS,
    NAVIGATOR_LEVEL_ORDER,
    type NavigatorPowerLevel,
    emitNavigatorPowerEffects,
    isNavigatorPowerLevel,
    navigatorPowerTarget,
    resolveNavigatorPower,
    resolveOpposedNavigatorPower,
} from './navigator-powers';

describe('NAVIGATOR_LEVEL_BONUS (#194)', () => {
    it('matches RAW Novice / Adept / Master = +0 / +10 / +20', () => {
        expect(NAVIGATOR_LEVEL_BONUS.novice).toBe(0);
        expect(NAVIGATOR_LEVEL_BONUS.adept).toBe(10);
        expect(NAVIGATOR_LEVEL_BONUS.master).toBe(20);
    });

    it('orders the levels Novice → Adept → Master', () => {
        expect([...NAVIGATOR_LEVEL_ORDER]).toEqual(['novice', 'adept', 'master']);
    });
});

describe('navigatorPowerTarget (#194)', () => {
    it('sums characteristic + level bonus when no other modifiers apply', () => {
        expect(navigatorPowerTarget({ characteristic: 40, level: 'novice' })).toBe(40);
        expect(navigatorPowerTarget({ characteristic: 40, level: 'adept' })).toBe(50);
        expect(navigatorPowerTarget({ characteristic: 40, level: 'master' })).toBe(60);
    });

    it('applies the power-specific difficulty modifier (RAW: Course Untravelled Novice = -10)', () => {
        expect(navigatorPowerTarget({ characteristic: 40, level: 'novice', difficultyModifier: -10 })).toBe(30);
    });

    it('stacks situational modifiers on top of difficulty', () => {
        expect(
            navigatorPowerTarget({
                characteristic: 40,
                level: 'adept',
                difficultyModifier: -10,
                situationalModifier: -20,
            }),
        ).toBe(20);
    });

    it('clamps the target to [0, 100]', () => {
        expect(navigatorPowerTarget({ characteristic: 90, level: 'master', situationalModifier: 30 })).toBe(100);
        expect(navigatorPowerTarget({ characteristic: 10, level: 'novice', difficultyModifier: -60 })).toBe(0);
    });
});

describe('resolveNavigatorPower (#194)', () => {
    it('counts DoS as floor((target-roll)/10)+1 on a pass', () => {
        const r = resolveNavigatorPower({ characteristic: 50, level: 'novice', roll: 30 });
        expect(r.target).toBe(50);
        expect(r.success).toBe(true);
        expect(r.dos).toBe(3);
        expect(r.dof).toBe(0);
        expect(r.level).toBe('novice');
    });

    it('a bare pass yields 1 DoS', () => {
        const r = resolveNavigatorPower({ characteristic: 50, level: 'novice', roll: 50 });
        expect(r.success).toBe(true);
        expect(r.dos).toBe(1);
    });

    it('a bare fail yields 1 DoF', () => {
        const r = resolveNavigatorPower({ characteristic: 50, level: 'novice', roll: 51 });
        expect(r.success).toBe(false);
        expect(r.dos).toBe(0);
        expect(r.dof).toBe(1);
    });

    it('counts DoF as floor((roll-target-1)/10)+1 on a fail', () => {
        const r = resolveNavigatorPower({ characteristic: 30, level: 'novice', roll: 75 });
        expect(r.success).toBe(false);
        expect(r.dof).toBe(5);
    });

    it('master bonus shifts the target up by +20', () => {
        const r = resolveNavigatorPower({ characteristic: 40, level: 'master', roll: 55 });
        // target = 40 + 20 = 60; roll 55 passes by 1 DoS
        expect(r.target).toBe(60);
        expect(r.success).toBe(true);
        expect(r.dos).toBe(1);
    });

    it('clamps the rolled d100 into [1, 100]', () => {
        const low = resolveNavigatorPower({ characteristic: 50, level: 'novice', roll: 0 });
        expect(low.roll).toBe(1);
        const high = resolveNavigatorPower({ characteristic: 50, level: 'novice', roll: 9999 });
        expect(high.roll).toBe(100);
    });
});

describe('resolveOpposedNavigatorPower (#194)', () => {
    it('manifests when the Navigator passes and outscores the opponent in DoS', () => {
        // Navigator: target=50+10=60, roll=10 → 6 DoS.
        // Opponent: target=40, roll=30 → 2 DoS.
        const r = resolveOpposedNavigatorPower({
            navigator: { characteristic: 50, level: 'adept', roll: 10 },
            opponent: { characteristic: 40, roll: 30 },
        });
        expect(r.navigator.dos).toBe(6);
        expect(r.opponent.dos).toBe(2);
        expect(r.netDos).toBe(4);
        expect(r.success).toBe(true);
    });

    it('fails when the Navigator passes but the opponent has equal-or-greater DoS', () => {
        // Navigator: target=40, roll=30 → 2 DoS. Opponent: target=50, roll=30 → 3 DoS.
        const r = resolveOpposedNavigatorPower({
            navigator: { characteristic: 40, level: 'novice', roll: 30 },
            opponent: { characteristic: 50, roll: 30 },
        });
        expect(r.navigator.success).toBe(true);
        expect(r.opponent.success).toBe(true);
        expect(r.netDos).toBe(-1);
        expect(r.success).toBe(false);
    });

    it('fails on tied DoS (target wins ties)', () => {
        // Both pass by 2 DoS.
        const r = resolveOpposedNavigatorPower({
            navigator: { characteristic: 40, level: 'novice', roll: 30 },
            opponent: { characteristic: 40, roll: 30 },
        });
        expect(r.navigator.dos).toBe(2);
        expect(r.opponent.dos).toBe(2);
        expect(r.netDos).toBe(0);
        expect(r.success).toBe(false);
    });

    it('fails when the Navigator outright fails their own test, regardless of opponent DoS', () => {
        const r = resolveOpposedNavigatorPower({
            navigator: { characteristic: 40, level: 'novice', roll: 90 },
            opponent: { characteristic: 40, roll: 90 },
        });
        expect(r.navigator.success).toBe(false);
        expect(r.success).toBe(false);
    });

    it('manifests when the Navigator passes and the opponent fails', () => {
        const r = resolveOpposedNavigatorPower({
            navigator: { characteristic: 50, level: 'master', roll: 20 },
            opponent: { characteristic: 30, roll: 90 },
        });
        expect(r.navigator.success).toBe(true);
        expect(r.opponent.success).toBe(false);
        expect(r.success).toBe(true);
    });
});

describe('emitNavigatorPowerEffects (#194)', () => {
    const levels = {
        novice: { effect: 'Locks the target in place.' },
        adept: { effect: 'Range extends to 20m x PerB; daemons take 2d10 instability.' },
        master: { effect: 'No line of sight required; daemons taking instability are destroyed.' },
    };

    it('returns only the Novice tier when active level is Novice', () => {
        const out = emitNavigatorPowerEffects(levels, 'novice');
        expect(out.map((t) => t.level)).toEqual(['novice']);
    });

    it('returns Novice + Adept tiers when active level is Adept', () => {
        const out = emitNavigatorPowerEffects(levels, 'adept');
        expect(out.map((t) => t.level)).toEqual(['novice', 'adept']);
    });

    it('returns all three tiers when active level is Master', () => {
        const out = emitNavigatorPowerEffects(levels, 'master');
        expect(out.map((t) => t.level)).toEqual(['novice', 'adept', 'master']);
        expect(out[2]?.effect).toContain('destroyed');
    });

    it('skips tiers with empty / missing effect text', () => {
        const sparse = { novice: { effect: 'A.' }, adept: { effect: '' }, master: { effect: 'C.' } };
        const out = emitNavigatorPowerEffects(sparse, 'master');
        expect(out.map((t) => t.level)).toEqual(['novice', 'master']);
    });

    it('handles a completely missing levels payload gracefully', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test boundary: probing the missing-payload branch
        const out = emitNavigatorPowerEffects({} as any, 'master');
        expect(out).toEqual([]);
    });
});

describe('isNavigatorPowerLevel (#194)', () => {
    it('accepts the three canonical tiers', () => {
        for (const v of ['novice', 'adept', 'master'] satisfies NavigatorPowerLevel[]) {
            expect(isNavigatorPowerLevel(v)).toBe(true);
        }
    });

    it('rejects unknown values', () => {
        expect(isNavigatorPowerLevel('grandmaster')).toBe(false);
        expect(isNavigatorPowerLevel(undefined)).toBe(false);
        expect(isNavigatorPowerLevel(null)).toBe(false);
        expect(isNavigatorPowerLevel(42)).toBe(false);
    });
});
