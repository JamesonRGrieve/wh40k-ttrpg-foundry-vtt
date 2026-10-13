import { describe, expect, it } from 'vitest';
import {
    actorSkillRank,
    buildReinforcementCallView,
    callerRequirementView,
    fixedAmount,
    type ReinforcementCallerTerms,
    type ReinforcementTerms,
    requiredCallerRank,
    requiredSkillLabel,
} from './reinforcement-call-view';

const NO_CALLER_TERMS: ReinforcementCallerTerms = { skill: '', specialization: '', rank: null, corruption: '' };

// Sister of Battle Canoness (DH2 core p. 296): minimum 50, cost 5, Peer (Adepta Sororitas) −2.
const CANONESS: ReinforcementTerms = {
    influenceMinimum: 50,
    influenceCost: 5,
    peerDiscount: { peer: 'Adepta Sororitas', amount: '2' },
    caller: NO_CALLER_TERMS,
};

// Thrice-Bound Daemonhost (Enemies Beyond p. 38): minimum 50, cost 5; the caller needs
// Forbidden Lore (Daemonology) at Trained and gains 1d5 Corruption.
const DAEMONHOST: ReinforcementTerms = {
    influenceMinimum: 50,
    influenceCost: 5,
    peerDiscount: { peer: '', amount: '' },
    caller: { skill: 'forbiddenLore', specialization: 'Daemonology', rank: 2, corruption: '1d5' },
};

const WARBAND = [
    { id: 'ibnad', name: 'Ibnad', influence: 55, skillRank: 0 },
    { id: 'magnus', name: 'Magnus', influence: 30, skillRank: 0 },
    { id: 'gus', name: 'Gus', influence: 20, skillRank: 0 },
];

const NO_CHOICES = { contributions: {}, peerDiscount: 0, gmAdjustment: 0 };

describe('fixedAmount', () => {
    it('reads a plain number and leaves a dice formula to roll', () => {
        expect(fixedAmount('2')).toBe(2);
        expect(fixedAmount(' 2 ')).toBe(2);
        expect(fixedAmount('1d5')).toBeNull();
        expect(fixedAmount('')).toBeNull();
    });
});

describe('buildReinforcementCallView (#77)', () => {
    it('plans a call with a contribution and the Peer discount', () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'ibnad', contributions: { magnus: 2 }, peerDiscount: 2, gmAdjustment: 1 }, '');
        expect(view.finalCost).toBe(4);
        expect(view.contributionCap).toBe(2);
        expect(view.problemKey).toBe('');
        expect(view.callerRequirement).toBeNull();
        expect(view.result).toEqual({ ok: true, plan: { finalCost: 4, callerPays: 2, contributions: [{ id: 'magnus', amount: 2 }], subtletyLoss: 4 } });
        expect(view.rows.map((r) => [r.id, r.isCaller, r.meetsMinimum, r.meetsSkill])).toEqual([
            ['ibnad', true, true, true],
            ['magnus', false, false, true],
            ['gus', false, false, true],
        ]);
    });
    it("ignores the caller's own contribution entry", () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'ibnad', contributions: { ibnad: 5 }, peerDiscount: 0, gmAdjustment: 0 }, '');
        expect(view.rows.find((r) => r.id === 'ibnad')?.contribution).toBe(0);
        expect(view.result).toMatchObject({ ok: true, plan: { callerPays: 5 } });
    });
    it('reports a caller below the Influence Minimum', () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'magnus', ...NO_CHOICES }, '');
        expect(view.problemKey).toBe('WH40K.Reinforcement.Problem.belowMinimum');
    });
    it('reports an over-cap contribution', () => {
        const view = buildReinforcementCallView(
            CANONESS,
            WARBAND,
            {
                callerId: 'ibnad',
                contributions: { magnus: 2, gus: 2 },
                peerDiscount: 0,
                gmAdjustment: 0,
            },
            '',
        );
        expect(view.problemKey).toBe('WH40K.Reinforcement.Problem.contributionCap');
    });
    it('blocks an NPC with no printed terms, and a missing caller', () => {
        const none: ReinforcementTerms = { influenceMinimum: null, influenceCost: null, peerDiscount: { peer: '', amount: '' }, caller: NO_CALLER_TERMS };
        expect(buildReinforcementCallView(none, WARBAND, { callerId: 'ibnad', ...NO_CHOICES }, '').problemKey).toBe('WH40K.Reinforcement.Problem.noTerms');
        expect(buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'nobody', ...NO_CHOICES }, '').problemKey).toBe(
            'WH40K.Reinforcement.Problem.noCaller',
        );
    });

    // Regression (#77): the Daemonhost's calling condition was GM prose, so any
    // Acolyte with the Influence could call it.
    it('blocks a Daemonhost caller without Forbidden Lore (Daemonology) at Trained', () => {
        const warband = [
            { id: 'ibnad', name: 'Ibnad', influence: 55, skillRank: 1 },
            { id: 'az', name: 'A.Z.', influence: 52, skillRank: 2 },
        ];
        const blocked = buildReinforcementCallView(DAEMONHOST, warband, { callerId: 'ibnad', ...NO_CHOICES }, 'Forbidden Lore');
        expect(blocked.problemKey).toBe('WH40K.Reinforcement.Problem.callerSkill');
        expect(blocked.rows.map((r) => r.meetsSkill)).toEqual([false, true]);
        const allowed = buildReinforcementCallView(DAEMONHOST, warband, { callerId: 'az', ...NO_CHOICES }, 'Forbidden Lore');
        expect(allowed.problemKey).toBe('');
        expect(allowed.callerRequirement).toEqual({
            skillLabel: 'Forbidden Lore (Daemonology)',
            rank: 2,
            rankKey: 'WH40K.Skills.Rank.Trained',
            corruption: '1d5',
        });
    });
});

describe('caller terms', () => {
    it('requires no rank when the RC names no skill, and Known when it names one without a rank', () => {
        expect(requiredCallerRank(NO_CALLER_TERMS)).toBeNull();
        expect(requiredCallerRank({ ...NO_CALLER_TERMS, skill: 'awareness' })).toBe(1);
        expect(requiredCallerRank(DAEMONHOST.caller)).toBe(2);
    });
    it('shows nothing for an RC without caller terms, and Corruption alone when that is all it prints', () => {
        expect(callerRequirementView(NO_CALLER_TERMS, '')).toBeNull();
        expect(callerRequirementView({ ...NO_CALLER_TERMS, corruption: '2' }, '')).toEqual({ skillLabel: '', rank: null, rankKey: '', corruption: '2' });
    });
    it("reads the skill's display name from the actor's skill rows", () => {
        expect(requiredSkillLabel({ forbiddenLore: { label: 'Forbidden Lore' } }, DAEMONHOST.caller)).toBe('Forbidden Lore');
        expect(requiredSkillLabel({}, DAEMONHOST.caller)).toBe('forbiddenLore');
        expect(requiredSkillLabel({ forbiddenLore: { label: 'Forbidden Lore' } }, NO_CALLER_TERMS)).toBe('');
    });
});

describe('actorSkillRank', () => {
    const skills = {
        awareness: { rank: 2 },
        forbiddenLore: {
            rank: 0,
            entries: [
                { name: 'Heresy', rank: 3 },
                { name: '', specialization: 'Daemonology', rank: 2 },
            ],
        },
    };
    it('reads a plain skill rank', () => {
        expect(actorSkillRank(skills, 'awareness', '')).toBe(2);
    });
    it('matches a specialist entry by name or specialisation, case-insensitively', () => {
        expect(actorSkillRank(skills, 'forbiddenLore', 'daemonology')).toBe(2);
        expect(actorSkillRank(skills, 'forbiddenLore', 'Heresy')).toBe(3);
    });
    it('is 0 for a missing skill or specialisation', () => {
        expect(actorSkillRank(skills, 'forbiddenLore', 'Xenos')).toBe(0);
        expect(actorSkillRank(skills, 'psyniscience', '')).toBe(0);
    });
});
