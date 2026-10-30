import { describe, expect, it } from 'vitest';
import { maxWarbandContribution, meetsCallerSkill, planReinforcementCall, reinforcementFinalCost } from './reinforcement';

/** An RC that prints no caller skill requirement. */
const NO_SKILL = { rank: 0, required: null };

describe('reinforcementFinalCost (DH2 core rules)', () => {
    it('subtracts the Peer discount and applies the GM adjustment', () => {
        // Sister of Battle Canoness: cost 5, Peer (Adepta Sororitas) −2.
        expect(reinforcementFinalCost(5, 2, 0)).toBe(3);
        expect(reinforcementFinalCost(5, 0, 3)).toBe(8);
        expect(reinforcementFinalCost(5, 2, -1)).toBe(2);
    });
    it('floors at 0 and ignores non-finite adjustments', () => {
        expect(reinforcementFinalCost(5, 9, 0)).toBe(0);
        expect(reinforcementFinalCost(5, 0, Number.NaN)).toBe(5);
    });
});

describe('maxWarbandContribution', () => {
    it('is half the cost, rounded up (the book example: cost 9 → 5)', () => {
        expect(maxWarbandContribution(9)).toBe(5);
        expect(maxWarbandContribution(16)).toBe(8);
        expect(maxWarbandContribution(0)).toBe(0);
    });
});

describe('meetsCallerSkill (a DH2 supplement)', () => {
    it('passes any caller when the RC prints no requirement', () => {
        expect(meetsCallerSkill({ rank: 0, required: null })).toBe(true);
    });
    it('needs Trained (rank 2) or better for the Thrice-Bound Daemonhost', () => {
        expect(meetsCallerSkill({ rank: 1, required: 2 })).toBe(false);
        expect(meetsCallerSkill({ rank: 2, required: 2 })).toBe(true);
        expect(meetsCallerSkill({ rank: 4, required: 2 })).toBe(true);
        expect(meetsCallerSkill({ rank: Number.NaN, required: 2 })).toBe(false);
    });
});

describe('planReinforcementCall', () => {
    // Regression (#77): the module used to model the call as an Influence TEST
    // modified by an invented standard/specialist/elite/master tier. RAW it is a
    // minimum gate plus a permanent spend.
    it('splits the book example: cost 9, the warband puts in 5, the caller pays 4', () => {
        const result = planReinforcementCall({
            callerInfluence: 50,
            influenceMinimum: 45,
            callerSkill: NO_SKILL,
            finalCost: 9,
            contributions: [
                { id: 'a', influence: 30, amount: 3 },
                { id: 'b', influence: 30, amount: 2 },
                { id: 'c', influence: 30, amount: 0 },
            ],
        });
        expect(result).toEqual({
            ok: true,
            plan: {
                finalCost: 9,
                callerPays: 4,
                contributions: [
                    { id: 'a', amount: 3 },
                    { id: 'b', amount: 2 },
                ],
                subtletyLoss: 9,
            },
        });
    });
    it('needs the caller at or above the Influence Minimum', () => {
        expect(planReinforcementCall({ callerInfluence: 44, influenceMinimum: 45, callerSkill: NO_SKILL, finalCost: 5, contributions: [] })).toEqual({
            ok: false,
            problem: 'belowMinimum',
        });
        expect(planReinforcementCall({ callerInfluence: 45, influenceMinimum: 45, callerSkill: NO_SKILL, finalCost: 5, contributions: [] }).ok).toBe(true);
    });
    // Regression (#77): the Daemonhost's skill condition was GM prose only, so an
    // Acolyte without Forbidden Lore (Daemonology) could call it.
    it('blocks a caller without the required skill rank (Thrice-Bound Daemonhost)', () => {
        const daemonhost = { callerInfluence: 55, influenceMinimum: 50, finalCost: 5, contributions: [] };
        expect(planReinforcementCall({ ...daemonhost, callerSkill: { rank: 1, required: 2 } })).toEqual({ ok: false, problem: 'callerSkill' });
        expect(planReinforcementCall({ ...daemonhost, callerSkill: { rank: 2, required: 2 } }).ok).toBe(true);
    });
    it('caps the warband contribution at half the cost, rounded up', () => {
        const over = planReinforcementCall({
            callerInfluence: 50,
            influenceMinimum: 45,
            callerSkill: NO_SKILL,
            finalCost: 9,
            contributions: [{ id: 'a', influence: 30, amount: 6 }],
        });
        expect(over).toEqual({ ok: false, problem: 'contributionCap' });
    });
    it('refuses a contribution larger than the contributor has', () => {
        const short = planReinforcementCall({
            callerInfluence: 50,
            influenceMinimum: 45,
            callerSkill: NO_SKILL,
            finalCost: 9,
            contributions: [{ id: 'a', influence: 2, amount: 3 }],
        });
        expect(short).toEqual({ ok: false, problem: 'contributorShort' });
    });
    it('refuses when the caller cannot pay their share', () => {
        expect(planReinforcementCall({ callerInfluence: 10, influenceMinimum: 0, callerSkill: NO_SKILL, finalCost: 16, contributions: [] })).toEqual({
            ok: false,
            problem: 'callerShort',
        });
    });
    it('reduces Subtlety by the final cost', () => {
        const result = planReinforcementCall({ callerInfluence: 70, influenceMinimum: 65, callerSkill: NO_SKILL, finalCost: 14, contributions: [] });
        expect(result.ok && result.plan.subtletyLoss).toBe(14);
    });
});
