import { describe, expect, it } from 'vitest';
import { buildPoisonFailurePayload, resolvePoisonExposure, type PoisonProfile } from './poison';

const ulvaSerum: PoisonProfile = {
    id: 'ulva-serum',
    label: 'Ulva-Serum',
    rating: 30,
    failureDamage: 1,
    ongoingDamagePerRound: 1,
    ongoingDurationRounds: 5,
    ongoingTag: 'crippled',
};

const dartVenom: PoisonProfile = {
    id: 'dart-venom',
    label: 'Dart Venom',
    rating: 10,
    failureDamage: 2,
    ongoingDamagePerRound: 0,
    ongoingDurationRounds: 0,
    ongoingTag: 'none',
};

describe('resolvePoisonExposure (#124)', () => {
    it('target = TB total − poison rating, floored at 0', () => {
        expect(resolvePoisonExposure({ toughnessTotal: 50, poisonRating: 30 }).target).toBe(20);
        expect(resolvePoisonExposure({ toughnessTotal: 20, poisonRating: 30 }).target).toBe(0);
    });
});

describe('buildPoisonFailurePayload (#124)', () => {
    it('returns the immediate damage + ongoing rider for an ongoing poison', () => {
        const payload = buildPoisonFailurePayload(ulvaSerum);
        expect(payload).toEqual({
            immediateDamage: 1,
            ongoingDamagePerRound: 1,
            ongoingDurationRounds: 5,
            ongoingTag: 'crippled',
        });
    });

    it('returns a single-event payload for a non-ongoing poison', () => {
        const payload = buildPoisonFailurePayload(dartVenom);
        expect(payload).toEqual({
            immediateDamage: 2,
            ongoingDamagePerRound: 0,
            ongoingDurationRounds: 0,
            ongoingTag: 'none',
        });
    });

    it('floors negative profile values at 0', () => {
        const broken: PoisonProfile = { ...ulvaSerum, failureDamage: -3, ongoingDamagePerRound: -1, ongoingDurationRounds: -2 };
        const payload = buildPoisonFailurePayload(broken);
        expect(payload.immediateDamage).toBe(0);
        expect(payload.ongoingDamagePerRound).toBe(0);
        expect(payload.ongoingDurationRounds).toBe(0);
    });
});
