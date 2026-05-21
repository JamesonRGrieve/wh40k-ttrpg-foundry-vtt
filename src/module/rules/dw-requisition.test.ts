import { describe, expect, it } from 'vitest';
import {
    canActorRequisition,
    canPoolRequisition,
    computeItemCost,
    computeMissionRpBudget,
    CRAFTSMANSHIP_MULTIPLIER,
    type RequisitionPolicy,
} from './dw-requisition';

/**
 * RAW Requisition resolver tests (#165 — core.md §"REQUISITION"
 * p. 5845, Tables 5-1 and 5-3).
 *
 * Every assertion is grounded in a single RAW reference and a
 * hand-checked value, so failures fingerprint to a specific rule.
 */

const TEST_POLICY: RequisitionPolicy = {
    ratingToRpPerBrother: {
        standard: 30,
        extended: 40,
        priority: 50,
        critical: 75,
    },
};

describe('CRAFTSMANSHIP_MULTIPLIER (Table 5-3)', () => {
    it('matches the RAW table exactly', () => {
        expect(CRAFTSMANSHIP_MULTIPLIER.poor).toBe(0.5);
        expect(CRAFTSMANSHIP_MULTIPLIER.common).toBe(1);
        expect(CRAFTSMANSHIP_MULTIPLIER.good).toBe(1.5);
        expect(CRAFTSMANSHIP_MULTIPLIER.best).toBe(2);
    });
});

describe('computeItemCost — craftsmanship multipliers', () => {
    it('halves base cost for Poor craftsmanship', () => {
        expect(computeItemCost(20, 'poor')).toBe(10);
    });

    it('leaves base cost untouched for Common craftsmanship', () => {
        expect(computeItemCost(20, 'common')).toBe(20);
    });

    it('multiplies by 1.5 for Good craftsmanship', () => {
        expect(computeItemCost(20, 'good')).toBe(30);
    });

    it('doubles base cost for Best craftsmanship', () => {
        expect(computeItemCost(20, 'best')).toBe(40);
    });

    it('clamps non-finite or negative base costs to zero', () => {
        expect(computeItemCost(Number.NaN, 'common')).toBe(0);
        expect(computeItemCost(-5, 'best')).toBe(0);
    });
});

describe('canActorRequisition — Renown rank gate', () => {
    it('blocks when actor rank is below required rank', () => {
        // 10 renown → 'initiated'; required 'famed' (60+).
        const result = canActorRequisition({
            actorRenown: 10,
            itemRequiredRank: 'famed',
            actorRp: 100,
            itemCost: 10,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('rank-too-low');
    });

    it('allows when actor rank equals required rank', () => {
        // 60 renown → 'famed'; required 'famed'.
        const result = canActorRequisition({
            actorRenown: 60,
            itemRequiredRank: 'famed',
            actorRp: 50,
            itemCost: 10,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('allows when actor rank exceeds required rank', () => {
        // 80 renown → 'hero'; required 'distinguished'.
        const result = canActorRequisition({
            actorRenown: 80,
            itemRequiredRank: 'distinguished',
            actorRp: 30,
            itemCost: 10,
        });
        expect(result.allowed).toBe(true);
    });
});

describe('canActorRequisition — RP gate', () => {
    it('blocks when actor RP is below item cost', () => {
        const result = canActorRequisition({
            actorRenown: 100,
            itemRequiredRank: 'initiated',
            actorRp: 5,
            itemCost: 20,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-rp');
    });

    it('allows when actor RP equals item cost', () => {
        const result = canActorRequisition({
            actorRenown: 100,
            itemRequiredRank: 'initiated',
            actorRp: 20,
            itemCost: 20,
        });
        expect(result.allowed).toBe(true);
    });
});

describe('canPoolRequisition', () => {
    it('succeeds when the sum of contributions equals item cost', () => {
        const result = canPoolRequisition({
            contributions: [
                { brotherId: 'a', rpContributed: 10 },
                { brotherId: 'b', rpContributed: 15 },
                { brotherId: 'c', rpContributed: 5 },
            ],
            itemCost: 30,
            brothersRpAvailable: { a: 20, b: 20, c: 10 },
        });
        expect(result.allowed).toBe(true);
        expect(result.totalContributed).toBe(30);
        expect(result.reason).toBeUndefined();
    });

    it('succeeds when the sum of contributions exceeds item cost', () => {
        const result = canPoolRequisition({
            contributions: [
                { brotherId: 'a', rpContributed: 20 },
                { brotherId: 'b', rpContributed: 20 },
            ],
            itemCost: 30,
            brothersRpAvailable: { a: 25, b: 25 },
        });
        expect(result.allowed).toBe(true);
        expect(result.totalContributed).toBe(40);
    });

    it('fails when any brother contributes more RP than available', () => {
        const result = canPoolRequisition({
            contributions: [
                { brotherId: 'a', rpContributed: 10 },
                { brotherId: 'b', rpContributed: 25 },
            ],
            itemCost: 30,
            brothersRpAvailable: { a: 20, b: 20 },
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('over-allocated');
    });

    it('fails when a contributor is unknown (treated as zero available)', () => {
        const result = canPoolRequisition({
            contributions: [
                { brotherId: 'a', rpContributed: 15 },
                { brotherId: 'ghost', rpContributed: 15 },
            ],
            itemCost: 30,
            brothersRpAvailable: { a: 20 },
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('over-allocated');
    });

    it('fails when total contributions are below item cost', () => {
        const result = canPoolRequisition({
            contributions: [
                { brotherId: 'a', rpContributed: 5 },
                { brotherId: 'b', rpContributed: 5 },
            ],
            itemCost: 30,
            brothersRpAvailable: { a: 20, b: 20 },
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-pool');
        expect(result.totalContributed).toBe(10);
    });
});

describe('computeMissionRpBudget (Table 5-1)', () => {
    it('multiplies per-brother RP by brother count', () => {
        expect(
            computeMissionRpBudget({
                missionRating: 'standard',
                brotherCount: 5,
                policy: TEST_POLICY,
            }),
        ).toBe(150);
    });

    it('scales with mission rating', () => {
        expect(
            computeMissionRpBudget({
                missionRating: 'critical',
                brotherCount: 4,
                policy: TEST_POLICY,
            }),
        ).toBe(300);
    });

    it('returns 0 for non-positive brother count', () => {
        expect(
            computeMissionRpBudget({
                missionRating: 'priority',
                brotherCount: 0,
                policy: TEST_POLICY,
            }),
        ).toBe(0);
    });

    it('returns 0 when the policy maps the rating to a non-positive value', () => {
        expect(
            computeMissionRpBudget({
                missionRating: 'standard',
                brotherCount: 4,
                policy: { ratingToRpPerBrother: { standard: 0, extended: 0, priority: 0, critical: 0 } },
            }),
        ).toBe(0);
    });
});
