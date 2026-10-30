import { describe, expect, it } from 'vitest';
import { circumstanceFactor } from './daemonic-mastery';
import { bindingDurationHours, prepareSummoningRitual, resolveMasteryContest, resolveTest, SUMMONING_LORE_FACTORS } from './summoning-ritual';

/** Daemon summoning (#80 — DH2). */
describe('prepareSummoningRitual', () => {
    const base = { forbiddenLoreTotal: 80, willpowerTotal: 40, hasTrueName: false, servesPatron: false, loreFactors: [], masteryFactors: [] };

    it('the ritual is a Hellish (−60) Forbidden Lore test', () => {
        expect(SUMMONING_LORE_FACTORS.HELLISH.modifier).toBe(-60);
        expect(prepareSummoningRitual(base).lore.target).toBe(20);
        expect(prepareSummoningRitual({ ...base, forbiddenLoreTotal: 50 }).lore.target).toBe(0);
    });

    it('True Name adds +30 to BOTH the ritual and the Mastery test (regression: lore bonus was missing)', () => {
        const r = prepareSummoningRitual({ ...base, hasTrueName: true });
        expect(r.lore.target).toBe(50);
        expect(r.mastery.target).toBe(40);
    });

    it('serving the patron god is +10 Mastery; no invented component factors', () => {
        const r = prepareSummoningRitual({ ...base, servesPatron: true });
        expect(r.mastery.components.map((c) => c.id)).toEqual(['base-difficulty', 'patron-servant']);
        expect(r.mastery.target).toBe(20);
    });

    it('carries GM factors onto the right test', () => {
        const r = prepareSummoningRitual({
            ...base,
            loreFactors: [circumstanceFactor('lore-gm', 'Summoning power', 30)],
            masteryFactors: [circumstanceFactor('mastery-gm', 'Incursion', 20)],
        });
        expect(r.lore.target).toBe(50);
        expect(r.mastery.target).toBe(30);
    });
});

describe('resolveTest', () => {
    it('reports degrees on both sides', () => {
        expect(resolveTest(25, 50)).toMatchObject({ success: true, dos: 3, dof: 0 });
        expect(resolveTest(71, 50)).toMatchObject({ success: false, dos: 0, dof: 3 });
    });
});

describe('resolveMasteryContest', () => {
    const contest = (summonerRoll: number, daemonRoll: number): ReturnType<typeof resolveMasteryContest> =>
        resolveMasteryContest({ summonerRoll, summonerTarget: 40, summonerWillpowerBonus: 4, daemonRoll, daemonWillpower: 45, daemonWillpowerBonus: 4 });

    it('binds for one hour per summoner DoS on a win', () => {
        const r = contest(10, 90);
        expect(r.winner).toBe('summoner');
        expect(r.bound).toBe(true);
        expect(r.boundHours).toBe(4);
    });

    it('a Daemon win leaves it free', () => {
        const r = contest(90, 10);
        expect(r.winner).toBe('daemon');
        expect(r.bound).toBe(false);
        expect(r.boundHours).toBe(0);
    });

    it('both failing is a stalemate and the Daemon is not bound', () => {
        const r = contest(95, 96);
        expect(r.winner).toBe('stalemate');
        expect(r.bound).toBe(false);
    });
});

describe('bindingDurationHours', () => {
    it('returns DoS hours, truncated and floored at 0', () => {
        expect(bindingDurationHours(3)).toBe(3);
        expect(bindingDurationHours(2.7)).toBe(2);
        expect(bindingDurationHours(-3)).toBe(0);
    });
});
