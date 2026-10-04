import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import { type ConditionMechanics, EMPTY_TICK } from './condition-mechanics.ts';
import { buildConditionCatalog, conditionMechanicsFor, setConditionCatalog } from './condition-registry.ts';
import { resolveTickTest, tickFailureCondition, tickHasEffect, ticksDueAtTurnStart } from './condition-tick.ts';

beforeEach(() => {
    setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
});

afterEach(() => {
    setConditionCatalog(new Map());
});

function one(line: 'dh2' | 'rt', id: string): ConditionMechanics {
    const resolved = conditionMechanicsFor(id, line);
    if (resolved === null) throw new Error(`fixture has no ${id}`);
    return resolved;
}

function bearer(line: 'dh2' | 'rt', ...ids: string[]): ConditionMechanics[] {
    return ids.map((id) => one(line, id));
}

describe('ticksDueAtTurnStart', () => {
    it('fires Fire (round) and Blood Loss (turn), not static conditions (dh2)', () => {
        expect(ticksDueAtTurnStart(bearer('dh2', 'prone', 'on-fire', 'blood-loss', 'stunned')).map((m) => m.identifier)).toEqual(['on-fire', 'blood-loss']);
    });

    it('resolves the same tick data for another line (rt)', () => {
        expect(ticksDueAtTurnStart(bearer('rt', 'on-fire')).map((m) => m.tick)).toEqual([
            {
                interval: 'round',
                damage: '1d10',
                damageType: 'energy',
                ignoresArmour: true,
                fatigue: 1,
                test: { characteristic: 'willpower', difficulty: 0 },
                onFail: '',
            },
        ]);
    });

    it('skips a minute-interval tick and an interval with nothing to do', () => {
        const fire = one('dh2', 'on-fire');
        const minute = { ...fire, identifier: 'slow', tick: { ...fire.tick, interval: 'minute' as const } };
        const empty = { ...fire, identifier: 'empty', tick: { ...EMPTY_TICK, interval: 'turn' as const } };
        expect(ticksDueAtTurnStart([minute, empty])).toEqual([]);
    });
});

describe('tickHasEffect', () => {
    it('is true for damage, fatigue or a test; false for an empty tick', () => {
        expect(tickHasEffect(EMPTY_TICK)).toBe(false);
        expect(tickHasEffect({ ...EMPTY_TICK, fatigue: 1 })).toBe(true);
        expect(tickHasEffect({ ...EMPTY_TICK, damage: '1d5' })).toBe(true);
        expect(tickHasEffect({ ...EMPTY_TICK, test: { characteristic: 'toughness', difficulty: 0 } })).toBe(true);
    });
});

describe('resolveTickTest', () => {
    it('tests the characteristic total plus the difficulty', () => {
        expect(resolveTickTest({ characteristic: 'willpower', difficulty: 0 }, 35, 30)).toEqual({ target: 35, success: true });
        expect(resolveTickTest({ characteristic: 'agility', difficulty: -20 }, 35, 30)).toEqual({ target: 15, success: false });
    });

    it('keeps the d100 extremes (01 passes, 100 fails)', () => {
        expect(resolveTickTest({ characteristic: 'toughness', difficulty: -60 }, 10, 1).success).toBe(true);
        expect(resolveTickTest({ characteristic: 'toughness', difficulty: 60 }, 90, 100).success).toBe(false);
    });
});

describe('tickFailureCondition', () => {
    it('Suffocating: a failed Toughness test applies Unconscious (dh2)', () => {
        const suffocating = one('dh2', 'suffocating');
        expect(tickFailureCondition(suffocating.tick, false, new Set(['suffocating']))).toBe('unconscious');
        expect(tickFailureCondition(suffocating.tick, true, new Set(['suffocating']))).toBeNull();
    });

    it('does not re-apply a condition the bearer already has, nor apply when onFail is empty (rt)', () => {
        const suffocating = one('rt', 'suffocating');
        const fire = one('rt', 'on-fire');
        expect(tickFailureCondition(suffocating.tick, false, new Set(['unconscious']))).toBeNull();
        expect(tickFailureCondition(fire.tick, false, new Set())).toBeNull();
    });
});
