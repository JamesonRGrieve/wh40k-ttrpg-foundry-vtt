import { describe, expect, it } from 'vitest';
import { degreesOfFailure, degreesOfSuccess, findBand, type OpposedSide, resolveOpposed, type Rng, rollD100, rollDie } from './_dice.ts';

const SAMPLE = [1, 5, 10, 11, 20, 21, 30, 41, 50, 55, 70, 90, 100];

describe('degreesOfSuccess (#301)', () => {
    it('yields 0 for a failed roll (roll > target)', () => {
        expect(degreesOfSuccess(51, 50)).toBe(0);
        expect(degreesOfSuccess(100, 1)).toBe(0);
    });

    it('a bare pass (roll === target) is 1 DoS', () => {
        expect(degreesOfSuccess(50, 50)).toBe(1);
        expect(degreesOfSuccess(1, 1)).toBe(1);
    });

    it('adds one DoS per full ten of margin', () => {
        expect(degreesOfSuccess(40, 50)).toBe(2); // margin 10
        expect(degreesOfSuccess(30, 50)).toBe(3); // margin 20
        expect(degreesOfSuccess(31, 50)).toBe(2); // margin 19 → floor 1 +1
    });
});

describe('degreesOfFailure (#301)', () => {
    it('yields 0 for a passing roll (roll <= target)', () => {
        expect(degreesOfFailure(50, 50)).toBe(0);
        expect(degreesOfFailure(1, 100)).toBe(0);
    });

    it('a bare fail (roll === target + 1) is 1 DoF', () => {
        expect(degreesOfFailure(51, 50)).toBe(1);
    });

    it('adds one DoF per full ten of margin (default inclusive)', () => {
        expect(degreesOfFailure(61, 50)).toBe(2); // margin 11
        expect(degreesOfFailure(70, 50)).toBe(3); // margin 20
    });

    it('inclusive:false shifts the boundary down one point (Navigator convention)', () => {
        // Original navigator math: floor((roll - target - 1) / 10) + 1
        for (const target of SAMPLE) {
            for (const roll of SAMPLE) {
                const expected = roll <= target ? 0 : Math.floor((roll - target - 1) / 10) + 1;
                expect(degreesOfFailure(roll, target, { inclusive: false })).toBe(expected);
            }
        }
    });
});

describe('resolveOpposed — equivalence with the hand-written resolvers (#301)', () => {
    it("tie:'a' matches the original grapple resolveOpposedStrength formula", () => {
        for (const aRoll of SAMPLE) {
            for (const aTarget of SAMPLE) {
                for (const bRoll of SAMPLE) {
                    for (const bTarget of SAMPLE) {
                        // Verbatim original grapple.ts logic.
                        const actorPassed = aRoll <= aTarget;
                        const opponentPassed = bRoll <= bTarget;
                        const actorDoS = actorPassed ? degreesOfSuccess(aRoll, aTarget) : 0;
                        const opponentDoS = opponentPassed ? degreesOfSuccess(bRoll, bTarget) : 0;
                        const expectedSuccess = actorDoS >= opponentDoS && (actorPassed || !opponentPassed);
                        const expectedNet = actorDoS - opponentDoS;

                        const got = resolveOpposed({ roll: aRoll, target: aTarget }, { roll: bRoll, target: bTarget }, { tie: 'a' });
                        expect(got.success).toBe(expectedSuccess);
                        expect(got.aDoS).toBe(actorDoS);
                        expect(got.bDoS).toBe(opponentDoS);
                        expect(got.netDoS).toBe(expectedNet);
                    }
                }
            }
        }
    });

    it("tie:'b' matches the original ship-ramming resolveRammingToHit formula", () => {
        for (const aRoll of SAMPLE) {
            for (const aTarget of SAMPLE) {
                for (const bRoll of SAMPLE) {
                    for (const bTarget of SAMPLE) {
                        // Verbatim original ship-ramming.ts logic.
                        const attackerPassed = aRoll <= aTarget;
                        const defenderPassed = bRoll <= bTarget;
                        const attackerDoS = attackerPassed ? degreesOfSuccess(aRoll, aTarget) : 0;
                        const defenderDoS = defenderPassed ? degreesOfSuccess(bRoll, bTarget) : 0;
                        const netDoS = attackerDoS - defenderDoS;
                        const expectedSuccess = attackerPassed && netDoS > 0;

                        const got = resolveOpposed({ roll: aRoll, target: aTarget }, { roll: bRoll, target: bTarget }, { tie: 'b' });
                        expect(got.success).toBe(expectedSuccess);
                        expect(got.netDoS).toBe(netDoS);
                    }
                }
            }
        }
    });

    it('an equal-DoS contest is decided purely by the tie rule', () => {
        const a: OpposedSide = { roll: 40, target: 50 }; // 2 DoS
        const b: OpposedSide = { roll: 30, target: 40 }; // 2 DoS
        expect(resolveOpposed(a, b, { tie: 'a' }).success).toBe(true);
        expect(resolveOpposed(a, b, { tie: 'b' }).success).toBe(false);
    });
});

describe('findBand (#301)', () => {
    const rows = [
        { range: [1, 25] as const, name: 'low' },
        { range: [26, 75] as const, name: 'mid' },
        { range: [76, 100] as const, name: 'high' },
    ];

    it('returns the row whose inclusive range contains the roll', () => {
        expect(findBand(rows, 1)?.name).toBe('low');
        expect(findBand(rows, 25)?.name).toBe('low');
        expect(findBand(rows, 26)?.name).toBe('mid');
        expect(findBand(rows, 100)?.name).toBe('high');
    });

    it('clamps out-of-band rolls to the first/last row by default', () => {
        expect(findBand(rows, -5)?.name).toBe('low');
        expect(findBand(rows, 250)?.name).toBe('high');
    });

    it('returns undefined for out-of-band rolls when clamp:false', () => {
        expect(findBand(rows, -5, { clamp: false })).toBeUndefined();
        expect(findBand(rows, 250, { clamp: false })).toBeUndefined();
    });

    it('returns undefined for an empty table', () => {
        expect(findBand([], 50)).toBeUndefined();
    });
});

describe('rollDie / rollD100 with a seeded Rng (#301)', () => {
    /** Deterministic generator cycling a fixed sequence of [0,1) floats. */
    function seeded(values: readonly number[]): Rng {
        let i = 0;
        return () => {
            const v = values[i % values.length] ?? 0;
            i += 1;
            return v;
        };
    }

    it('maps the Rng float into 1..faces inclusive', () => {
        const rng = seeded([0, 0.5, 0.999999]);
        expect(rollDie(10, rng)).toBe(1); // 0   → 1
        expect(rollDie(10, rng)).toBe(6); // 0.5 → 6
        expect(rollDie(10, rng)).toBe(10); // ~1 → 10
    });

    it('rollD100 rolls 1..100', () => {
        expect(rollD100(seeded([0]))).toBe(1);
        expect(rollD100(seeded([0.5]))).toBe(51);
        expect(rollD100(seeded([0.999999]))).toBe(100);
    });
});
