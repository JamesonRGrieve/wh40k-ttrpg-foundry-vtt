import { describe, expect, it } from 'vitest';
import { calculateTotalCost, canAfford, getAvailableXP, getXPSummary, type XpActorView } from './xp-transaction.ts';

/**
 * Coverage for the read-only XP helpers + the pure cost sum. Their actor param
 * was narrowed to a structural XpActorView so they're testable without a
 * Document. The mutating spendXP / spendXPBatch (actor.update + chat) are left
 * for a Document-update harness.
 */

type Experience = NonNullable<XpActorView['system']['experience']>;

function actorView(experience?: Experience): XpActorView {
    return { system: experience !== undefined ? { experience } : {} };
}

describe('getAvailableXP', () => {
    it('is total − used', () => {
        expect(getAvailableXP(actorView({ total: 1000, used: 300 }))).toBe(700);
    });

    it('is 0 when the actor has no experience block', () => {
        expect(getAvailableXP(actorView())).toBe(0);
    });
});

describe('canAfford', () => {
    it('compares the cost against available XP', () => {
        const actor = actorView({ total: 1000, used: 300 });
        expect(canAfford(actor, 500)).toBe(true);
        expect(canAfford(actor, 700)).toBe(true);
        expect(canAfford(actor, 800)).toBe(false);
    });
});

describe('getXPSummary', () => {
    it('reports totals, available, and per-category spend', () => {
        const summary = getXPSummary(
            actorView({ total: 1000, used: 300, spentCharacteristics: 100, spentSkills: 50, spentTalents: 75, spentPsychicPowers: 25 }),
        );
        expect(summary).toEqual({
            total: 1000,
            used: 300,
            available: 700,
            spentOnCharacteristics: 100,
            spentOnSkills: 50,
            spentOnTalents: 75,
            spentOnPsychicPowers: 25,
        });
    });

    it('defaults every field to 0 without an experience block', () => {
        expect(getXPSummary(actorView())).toEqual({
            total: 0,
            used: 0,
            available: 0,
            spentOnCharacteristics: 0,
            spentOnSkills: 0,
            spentOnTalents: 0,
            spentOnPsychicPowers: 0,
        });
    });
});

describe('calculateTotalCost', () => {
    it('sums advancement costs', () => {
        expect(calculateTotalCost([{ cost: 100 }, { cost: 50 }, { cost: 25 }])).toBe(175);
    });

    it('is 0 for an empty list', () => {
        expect(calculateTotalCost([])).toBe(0);
    });
});
