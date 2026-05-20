import { describe, expect, it } from 'vitest';
import {
    awardRenown,
    canRequisition,
    getRenownRank,
    loseRenown,
    RENOWN_MAX,
    RENOWN_MIN,
    RENOWN_RANK_ORDER,
    RENOWN_THRESHOLDS,
    renownRankIndex,
} from './dw-renown';

/**
 * RAW Renown resolver tests (#164 — core.md §"RENOWN" p. 5880, Table 5-2;
 * rites.md Table 5-1, §"LOSING RENOWN").
 *
 * Every literal assertion is grounded in a single RAW citation and a
 * hand-checked value, so failures fingerprint to a specific rule rather
 * than vague "math drifted".
 */
describe('TABLE 5-2 — Renown Rank thresholds (#164)', () => {
    it('exposes the five canonical ranks in ascending order', () => {
        expect(RENOWN_RANK_ORDER).toEqual(['initiated', 'respected', 'distinguished', 'famed', 'hero']);
    });

    it('declares Initiated as 0-19', () => {
        expect(RENOWN_THRESHOLDS.initiated).toEqual({ min: 0, max: 19 });
    });
    it('declares Respected as 20-39', () => {
        expect(RENOWN_THRESHOLDS.respected).toEqual({ min: 20, max: 39 });
    });
    it('declares Distinguished as 40-59', () => {
        expect(RENOWN_THRESHOLDS.distinguished).toEqual({ min: 40, max: 59 });
    });
    it('declares Famed as 60-79', () => {
        expect(RENOWN_THRESHOLDS.famed).toEqual({ min: 60, max: 79 });
    });
    it('declares Hero as 80+ (no upper cap)', () => {
        expect(RENOWN_THRESHOLDS.hero.min).toBe(80);
        expect(RENOWN_THRESHOLDS.hero.max).toBe(Number.POSITIVE_INFINITY);
    });

    it('exposes floor / soft-cap constants', () => {
        expect(RENOWN_MIN).toBe(0);
        expect(RENOWN_MAX).toBe(100);
    });
});

describe('getRenownRank — table lookup at every threshold', () => {
    it('Renown 0 → Initiated (floor)', () => {
        expect(getRenownRank(0)).toBe('initiated');
    });
    it('Renown 19 → Initiated (upper edge of band)', () => {
        expect(getRenownRank(19)).toBe('initiated');
    });
    it('Renown 20 → Respected (lower edge of band)', () => {
        expect(getRenownRank(20)).toBe('respected');
    });
    it('Renown 39 → Respected (upper edge)', () => {
        expect(getRenownRank(39)).toBe('respected');
    });
    it('Renown 40 → Distinguished', () => {
        expect(getRenownRank(40)).toBe('distinguished');
    });
    it('Renown 59 → Distinguished (upper edge)', () => {
        expect(getRenownRank(59)).toBe('distinguished');
    });
    it('Renown 60 → Famed', () => {
        expect(getRenownRank(60)).toBe('famed');
    });
    it('Renown 79 → Famed (upper edge)', () => {
        expect(getRenownRank(79)).toBe('famed');
    });
    it('Renown 80 → Hero (lower edge)', () => {
        expect(getRenownRank(80)).toBe('hero');
    });
    it('Renown 100 → Hero (soft cap value)', () => {
        expect(getRenownRank(100)).toBe('hero');
    });
    it('Renown 150 (over soft cap) → still Hero', () => {
        expect(getRenownRank(150)).toBe('hero');
    });

    it('negative Renown falls back to Initiated', () => {
        expect(getRenownRank(-5)).toBe('initiated');
    });
    it('NaN falls back to Initiated', () => {
        expect(getRenownRank(Number.NaN)).toBe('initiated');
    });
});

describe('renownRankIndex — ordered comparison index', () => {
    it('Initiated is index 0', () => {
        expect(renownRankIndex('initiated')).toBe(0);
    });
    it('Hero is index 4', () => {
        expect(renownRankIndex('hero')).toBe(4);
    });
    it('order matches RENOWN_RANK_ORDER', () => {
        RENOWN_RANK_ORDER.forEach((rank, i) => {
            expect(renownRankIndex(rank)).toBe(i);
        });
    });
});

describe('canRequisition — Armoury Renown gate', () => {
    it('actor rank equal to required rank → allowed', () => {
        // Respected actor (Renown 25), item requires Respected.
        expect(canRequisition({ renown: 25, requiredRank: 'respected' })).toBe(true);
    });
    it('actor rank above required rank → allowed', () => {
        // Famed actor (Renown 70), item requires Respected.
        expect(canRequisition({ renown: 70, requiredRank: 'respected' })).toBe(true);
    });
    it('actor rank below required rank → denied', () => {
        // Initiated actor (Renown 10), item requires Distinguished.
        expect(canRequisition({ renown: 10, requiredRank: 'distinguished' })).toBe(false);
    });
    it('Hero actor can requisition Hero-gated items', () => {
        expect(canRequisition({ renown: 80, requiredRank: 'hero' })).toBe(true);
    });
    it('Famed actor cannot requisition Hero-gated items (one rank short)', () => {
        expect(canRequisition({ renown: 79, requiredRank: 'hero' })).toBe(false);
    });
    it('every actor can requisition Initiated-gated items', () => {
        expect(canRequisition({ renown: 0, requiredRank: 'initiated' })).toBe(true);
    });
    it('threshold boundary: Renown 20 (Respected) can requisition Respected', () => {
        expect(canRequisition({ renown: 20, requiredRank: 'respected' })).toBe(true);
    });
    it('threshold boundary: Renown 19 (Initiated) cannot requisition Respected', () => {
        expect(canRequisition({ renown: 19, requiredRank: 'respected' })).toBe(false);
    });
});

describe('awardRenown — per-mission rewards (rites.md Table 5-1)', () => {
    it('adds the awarded amount to current Renown', () => {
        expect(awardRenown(15, 5)).toBe(20);
    });
    it('can carry a Marine across a rank threshold', () => {
        // Initiated 19 + 5 → Respected 24 (rank flip on read).
        expect(awardRenown(19, 5)).toBe(24);
        expect(getRenownRank(awardRenown(19, 5))).toBe('respected');
    });
    it('can push a Hero Marine past the soft cap of 100', () => {
        // RAW: no hard upper cap.
        expect(awardRenown(95, 20)).toBe(115);
        expect(getRenownRank(115)).toBe('hero');
    });
    it('award of 0 is a no-op', () => {
        expect(awardRenown(30, 0)).toBe(30);
    });
    it('negative award is a no-op (does not silently subtract)', () => {
        expect(awardRenown(30, -10)).toBe(30);
    });
    it('non-finite award is a no-op', () => {
        expect(awardRenown(30, Number.NaN)).toBe(30);
        expect(awardRenown(30, Number.POSITIVE_INFINITY)).toBe(30);
    });
    it('non-finite current Renown resets to floor before adding', () => {
        expect(awardRenown(Number.NaN, 5)).toBe(5);
    });
    it('does not allow result below floor even from corrupt input', () => {
        expect(awardRenown(-10, 0)).toBe(RENOWN_MIN);
    });
});

describe('loseRenown — §"LOSING RENOWN"', () => {
    it('subtracts the lost amount', () => {
        expect(loseRenown(25, 5)).toBe(20);
    });
    it('clamps at 0 — RAW does not contemplate negative Renown', () => {
        expect(loseRenown(3, 10)).toBe(RENOWN_MIN);
    });
    it('can cross a rank threshold downward', () => {
        // Respected 22 - 5 → Initiated 17.
        expect(loseRenown(22, 5)).toBe(17);
        expect(getRenownRank(loseRenown(22, 5))).toBe('initiated');
    });
    it('loss of 0 is a no-op', () => {
        expect(loseRenown(30, 0)).toBe(30);
    });
    it('negative loss is a no-op (does not silently add)', () => {
        expect(loseRenown(30, -10)).toBe(30);
    });
    it('non-finite loss is a no-op', () => {
        expect(loseRenown(30, Number.NaN)).toBe(30);
    });
    it('non-finite current Renown resets to floor', () => {
        expect(loseRenown(Number.NaN, 5)).toBe(RENOWN_MIN);
    });
});
