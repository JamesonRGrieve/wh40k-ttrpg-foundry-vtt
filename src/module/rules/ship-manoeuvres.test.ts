/**
 * Unit coverage for the RT Starship Manoeuvre Action registry (#185).
 *
 * Asserts:
 *   1. Registry shape — every canonical Table 8-10 entry is present,
 *      sourced from the same `'Pilot (Space Craft)'` test, RT-gated,
 *      and carries an i18n key for both display name and benefit.
 *   2. Difficulty tiers map cleanly onto the `difficulties.ts` ladder
 *      (Challenging +0, Difficult -10, Hard -20).
 *   3. Combined-test math: target = Pilot + Manoeuvrability + difficulty
 *      (+ optional situational), per RAW "Pilot (Space Craft)+Manoeuvrability
 *      Test" wording.
 *   4. Opposed flag — only Disengage is opposed.
 *   5. Per-system gating — `getShipManoeuvresForSystem` returns the full
 *      set for `'rt'` and empty for every other game-system id.
 */

import { describe, expect, it } from 'vitest';
import { rollDifficulties } from './difficulties';
import {
    getShipManoeuvre,
    getShipManoeuvreIds,
    getShipManoeuvresForSystem,
    resolveShipManoeuvreCombinedTest,
    SHIP_MANOEUVRES,
    type ShipManoeuvreId,
} from './ship-manoeuvres';

describe('SHIP_MANOEUVRES registry shape', () => {
    it('contains the six RAW Table 8-10 entries', () => {
        const ids = getShipManoeuvreIds();
        expect(ids).toEqual(['adjust-bearing', 'adjust-speed', 'adjust-speed-and-bearing', 'come-to-new-heading', 'disengage', 'evasive-manoeuvres']);
        expect(SHIP_MANOEUVRES).toHaveLength(6);
    });

    it('every entry uses the Pilot (Space Craft) test', () => {
        for (const m of SHIP_MANOEUVRES) {
            expect(m.test).toBe('Pilot (Space Craft)');
        }
    });

    it('every entry is RT-gated', () => {
        for (const m of SHIP_MANOEUVRES) {
            expect(m.gameSystem).toBe('rt');
        }
    });

    it('every entry carries i18n keys for label and benefit', () => {
        for (const m of SHIP_MANOEUVRES) {
            expect(m.labelKey).toMatch(/^WH40K\.Starship\.Manoeuvre\.[A-Za-z]+\.Label$/);
            expect(m.benefitKey).toMatch(/^WH40K\.Starship\.Manoeuvre\.[A-Za-z]+\.Benefit$/);
        }
    });

    it('getShipManoeuvre returns the entry by id and undefined for misses', () => {
        const adj = getShipManoeuvre('adjust-bearing');
        expect(adj?.difficulty).toBe(0);
        expect(getShipManoeuvre('not-a-real-id')).toBeUndefined();
    });
});

describe('Difficulty tiers map to the difficulties.ts ladder', () => {
    const difficulties = rollDifficulties();

    it('adjust-bearing / adjust-speed / disengage are Challenging (+0)', () => {
        expect(getShipManoeuvre('adjust-bearing')?.difficulty).toBe(0);
        expect(getShipManoeuvre('adjust-speed')?.difficulty).toBe(0);
        expect(getShipManoeuvre('disengage')?.difficulty).toBe(0);
        expect(difficulties['0']).toBe('Challenging (+0)');
    });

    it('come-to-new-heading / evasive-manoeuvres are Difficult (-10)', () => {
        expect(getShipManoeuvre('come-to-new-heading')?.difficulty).toBe(-10);
        expect(getShipManoeuvre('evasive-manoeuvres')?.difficulty).toBe(-10);
        expect(difficulties['-10']).toBe('Difficult (-10)');
    });

    it('adjust-speed-and-bearing is Hard (-20)', () => {
        expect(getShipManoeuvre('adjust-speed-and-bearing')?.difficulty).toBe(-20);
        expect(difficulties['-20']).toBe('Hard (-20)');
    });
});

describe('Opposed flag (Disengage)', () => {
    it('Disengage is the only opposed entry', () => {
        const opposed = SHIP_MANOEUVRES.filter((m) => m.opposed === true).map((m) => m.id);
        expect(opposed).toEqual(['disengage']);
    });

    it('non-opposed entries do not carry the opposed flag truthy', () => {
        for (const m of SHIP_MANOEUVRES) {
            if (m.id === 'disengage') continue;
            expect(m.opposed).not.toBe(true);
        }
    });
});

describe('Per-system gating', () => {
    it('returns the full catalogue for rt', () => {
        const rt = getShipManoeuvresForSystem('rt');
        expect(rt).toHaveLength(SHIP_MANOEUVRES.length);
    });

    it.each(['dh1', 'dh2', 'bc', 'ow', 'dw', 'im'] as const)('returns no entries for %s', (sys) => {
        expect(getShipManoeuvresForSystem(sys)).toEqual([]);
    });
});

describe('resolveShipManoeuvreCombinedTest', () => {
    it('target = Pilot + Manoeuvrability + difficulty for Challenging actions', () => {
        const r = resolveShipManoeuvreCombinedTest('adjust-bearing', { pilot: 45, manoeuvrability: 15 });
        // 45 + 15 + 0 = 60
        expect(r.target).toBe(60);
        expect(r.breakdown).toEqual({ pilot: 45, manoeuvrability: 15, difficulty: 0, situational: 0 });
        expect(r.opposed).toBe(false);
    });

    it('subtracts 10 for Difficult Manoeuvres (Come to New Heading)', () => {
        const r = resolveShipManoeuvreCombinedTest('come-to-new-heading', { pilot: 45, manoeuvrability: 15 });
        // 45 + 15 - 10 = 50
        expect(r.target).toBe(50);
        expect(r.breakdown.difficulty).toBe(-10);
    });

    it('subtracts 10 for Difficult Manoeuvres (Evasive Manoeuvres)', () => {
        const r = resolveShipManoeuvreCombinedTest('evasive-manoeuvres', { pilot: 35, manoeuvrability: 5 });
        // 35 + 5 - 10 = 30
        expect(r.target).toBe(30);
        expect(r.breakdown.difficulty).toBe(-10);
    });

    it('subtracts 20 for Hard Manoeuvres (Adjust Speed & Bearing)', () => {
        const r = resolveShipManoeuvreCombinedTest('adjust-speed-and-bearing', { pilot: 50, manoeuvrability: 10 });
        // 50 + 10 - 20 = 40
        expect(r.target).toBe(40);
        expect(r.breakdown.difficulty).toBe(-20);
    });

    it('honours negative ship Manoeuvrability (lumbering hulks)', () => {
        // Cobra-style helmsman aboard a Goliath transport — Man -10.
        const r = resolveShipManoeuvreCombinedTest('adjust-bearing', { pilot: 40, manoeuvrability: -10 });
        // 40 + (-10) + 0 = 30
        expect(r.target).toBe(30);
    });

    it('adds the optional situational modifier on top of the action difficulty', () => {
        // +10 component bonus on a Difficult Manoeuvre still resolves correctly.
        const r = resolveShipManoeuvreCombinedTest('evasive-manoeuvres', {
            pilot: 45,
            manoeuvrability: 15,
            situational: 10,
        });
        // 45 + 15 - 10 + 10 = 60
        expect(r.target).toBe(60);
        expect(r.breakdown.situational).toBe(10);
    });

    it('marks Disengage as opposed in the result', () => {
        const r = resolveShipManoeuvreCombinedTest('disengage', { pilot: 30, manoeuvrability: 20 });
        expect(r.opposed).toBe(true);
        expect(r.target).toBe(50);
    });

    it('does not mark non-Disengage actions as opposed', () => {
        for (const id of getShipManoeuvreIds()) {
            if (id === 'disengage') continue;
            const r = resolveShipManoeuvreCombinedTest(id, { pilot: 30, manoeuvrability: 0 });
            expect(r.opposed).toBe(false);
        }
    });

    it('throws on an unknown manoeuvre id', () => {
        expect(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional bad input for negative case
            resolveShipManoeuvreCombinedTest('teleport' as ShipManoeuvreId, { pilot: 30, manoeuvrability: 0 }),
        ).toThrow(/Unknown ship Manoeuvre id/);
    });
});
