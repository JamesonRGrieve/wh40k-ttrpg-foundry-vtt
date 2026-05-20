import { describe, expect, it } from 'vitest';
import { hasDaemonic, resolveUndyingRevival, shouldSkipDiseaseExposure, shouldSkipPoisonExposure, type DaemonicActorLike } from './daemonic-immunities';

describe('hasDaemonic (#143)', () => {
    it('matches an inline trait named "Daemonic"', () => {
        const actor: DaemonicActorLike = { system: { traits: [{ name: 'Daemonic' }] } };
        expect(hasDaemonic(actor)).toBe(true);
    });

    it('matches case-insensitively', () => {
        const actor: DaemonicActorLike = { system: { traits: [{ name: 'daemonic' }] } };
        expect(hasDaemonic(actor)).toBe(true);
    });

    it('matches a trait item on actor.items', () => {
        const actor: DaemonicActorLike = { items: [{ type: 'trait', name: 'Daemonic' }] };
        expect(hasDaemonic(actor)).toBe(true);
    });

    it('returns false when no Daemonic trait is present', () => {
        const actor: DaemonicActorLike = { system: { traits: [{ name: 'Fear (3)' }] }, items: [{ type: 'trait', name: 'Unnatural Toughness' }] };
        expect(hasDaemonic(actor)).toBe(false);
    });

    it('returns false on an empty surface', () => {
        expect(hasDaemonic({})).toBe(false);
    });
});

describe('shouldSkipDiseaseExposure / shouldSkipPoisonExposure (#143)', () => {
    const daemon: DaemonicActorLike = { system: { traits: [{ name: 'Daemonic' }] } };
    const mortal: DaemonicActorLike = { system: { traits: [{ name: 'Fear (1)' }] } };

    it('disease exposure is skipped for Daemonic actors', () => {
        expect(shouldSkipDiseaseExposure(daemon)).toBe(true);
    });

    it('disease exposure is not skipped for mortals', () => {
        expect(shouldSkipDiseaseExposure(mortal)).toBe(false);
    });

    it('poison exposure is skipped for Daemonic actors', () => {
        expect(shouldSkipPoisonExposure(daemon)).toBe(true);
    });

    it('poison exposure is not skipped for mortals', () => {
        expect(shouldSkipPoisonExposure(mortal)).toBe(false);
    });
});

describe('resolveUndyingRevival (#143)', () => {
    const daemon: DaemonicActorLike = { system: { traits: [{ name: 'Daemonic' }] } };
    const mortal: DaemonicActorLike = { system: { traits: [] } };

    it('revives a Daemonic creature on first death this session', () => {
        const outcome = resolveUndyingRevival(daemon, false);
        expect(outcome.revived).toBe(true);
        expect(outcome.newWoundsValue).toBe(1);
        expect(outcome.consumeSessionFlag).toBe(true);
    });

    it('does not revive when the once-per-session flag is already consumed', () => {
        const outcome = resolveUndyingRevival(daemon, true);
        expect(outcome.revived).toBe(false);
        expect(outcome.consumeSessionFlag).toBe(false);
    });

    it('never revives a non-Daemonic actor', () => {
        const outcome = resolveUndyingRevival(mortal, false);
        expect(outcome.revived).toBe(false);
        expect(outcome.consumeSessionFlag).toBe(false);
    });
});
