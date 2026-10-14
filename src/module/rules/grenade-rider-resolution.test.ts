import { describe, expect, it } from 'vitest';
import { riderFixture } from '../testing/grenade-rider-fixture.ts';
import {
    type RiderCreature,
    resolveRiderCreature,
    riderAffectsCreature,
    riderDurationRounds,
    riderEffectRollShift,
    riderRollsDuration,
    riderTestComponents,
} from './grenade-rider-resolution.ts';

/**
 * Resolving a grenade's rider against the creatures caught (#623): each creature tests
 * the rider's characteristic with its modifier (and a psyker's, where printed); a
 * failure applies the rider's condition for base + degrees, rolled, or encounter rounds.
 * The riders are the ones the packs author (DH2 Core p.158 Photon Flash; Enemies Within
 * p.44–45 Psychotroke, Rad, Spore Bomb, Tears of the Emperor; RT Faith and Coin p.85
 * Psyk-out).
 */

const PHOTON_FLASH = riderFixture({
    test: { characteristic: 'agility', modifier: 10 },
    condition: 'blinded',
    duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
});
const RT_PSYK_OUT = riderFixture({
    test: { characteristic: 'willpower', modifier: -10 },
    affects: 'psyker',
    condition: 'stunned',
    duration: { kind: 'roll', base: 0, formula: '1d5+3' },
});
const SPORE_BOMB = riderFixture({ test: { characteristic: 'toughness', modifier: 10, psykerModifier: -20 } });
const PSYCHOTROKE = riderFixture({
    test: { characteristic: 'toughness', modifier: -40 },
    duration: { kind: 'degreesOfFailure', base: 1, formula: '' },
    effectRollShift: { perDegree: 1, max: 10 },
});
const TEARS = riderFixture({ duration: { kind: 'encounter', base: 0, formula: '' } });

function creature(overrides: Partial<RiderCreature> = {}): RiderCreature {
    return { tokenId: 't1', actorUuid: 'Actor.a1', name: 'Heretic', isPsyker: false, characteristic: 30, ...overrides };
}

describe('riderAffectsCreature', () => {
    it('touches everyone caught, or only psykers when the rider says so', () => {
        expect(riderAffectsCreature(PHOTON_FLASH, creature())).toBe(true);
        expect(riderAffectsCreature(RT_PSYK_OUT, creature())).toBe(false);
        expect(riderAffectsCreature(RT_PSYK_OUT, creature({ isPsyker: true }))).toBe(true);
    });
});

describe('riderTestComponents', () => {
    it('carries the grenade modifier and, for a psyker, the psyker modifier, each with its provenance', () => {
        expect(riderTestComponents(SPORE_BOMB, creature())).toEqual([{ source: 'grenade', value: 10 }]);
        expect(riderTestComponents(SPORE_BOMB, creature({ isPsyker: true }))).toEqual([
            { source: 'grenade', value: 10 },
            { source: 'psyker', value: -20 },
        ]);
    });

    it('adds no row for a +0 test (#616)', () => {
        expect(riderTestComponents(riderFixture({ test: { characteristic: 'toughness', modifier: 0 } }), creature())).toEqual([]);
    });
});

describe('riderDurationRounds', () => {
    it('reads base plus degrees, a rolled count, or no round count for the encounter or none', () => {
        expect(riderDurationRounds(PHOTON_FLASH, 3, null)).toBe(3);
        expect(riderDurationRounds(PSYCHOTROKE, 2, null)).toBe(3);
        expect(riderDurationRounds(RT_PSYK_OUT, 1, 6)).toBe(6);
        expect(riderDurationRounds(TEARS, 0, null)).toBeNull();
        expect(riderDurationRounds(SPORE_BOMB, 2, null)).toBeNull();
    });

    it('rolls a duration only for a rolled kind', () => {
        expect(riderRollsDuration(RT_PSYK_OUT)).toBe(true);
        expect(riderRollsDuration(PHOTON_FLASH)).toBe(false);
    });
});

describe('riderEffectRollShift', () => {
    it('steps the effect roll per degree of failure, capped', () => {
        expect(riderEffectRollShift(PSYCHOTROKE, 3)).toBe(3);
        expect(riderEffectRollShift(PSYCHOTROKE, 14)).toBe(10);
        expect(riderEffectRollShift(PHOTON_FLASH, 3)).toBe(0);
    });
});

describe('resolveRiderCreature', () => {
    it('blinds a Photon Flash failure for its degrees of failure (Core p.158)', () => {
        // Agility 30 + 10 = 40 against 68: three degrees of failure.
        const result = resolveRiderCreature({ rider: PHOTON_FLASH, creature: creature(), roll: 68, rolledRounds: null });
        expect(result).toMatchObject({ affected: true, suffers: true, condition: 'blinded', rounds: 3, untilEncounterEnd: false });
        expect(result.test).toMatchObject({ base: 30, target: 40, roll: 68, passed: false, degreesOfFailure: 3 });
    });

    it('lets a pass resist: no condition, no rounds', () => {
        const result = resolveRiderCreature({ rider: PHOTON_FLASH, creature: creature(), roll: 40, rolledRounds: null });
        expect(result).toMatchObject({ affected: true, suffers: false, rounds: null });
        expect(result.test?.passed).toBe(true);
    });

    it('fails a natural 100 by at least one degree, and passes a natural 01', () => {
        const strong = creature({ characteristic: 95 });
        expect(resolveRiderCreature({ rider: PHOTON_FLASH, creature: strong, roll: 100, rolledRounds: null })).toMatchObject({ suffers: true, rounds: 1 });
        expect(resolveRiderCreature({ rider: PHOTON_FLASH, creature: creature({ characteristic: 0 }), roll: 1, rolledRounds: null }).suffers).toBe(false);
    });

    it('caps the modifiers at ±60 through the shared aggregator', () => {
        const harsh = riderFixture({ test: { characteristic: 'toughness', modifier: -60, psykerModifier: -20 } });
        expect(
            resolveRiderCreature({ rider: harsh, creature: creature({ isPsyker: true, characteristic: 70 }), roll: 5, rolledRounds: null }).test?.target,
        ).toBe(10);
    });

    it('leaves a non-psyker in a Psyk-out cloud unaffected, untested', () => {
        expect(resolveRiderCreature({ rider: RT_PSYK_OUT, creature: creature(), roll: null, rolledRounds: null })).toMatchObject({
            affected: false,
            test: null,
            suffers: false,
        });
    });

    it('stuns a psyker who fails for the rolled rounds (RT Faith and Coin p.85)', () => {
        const result = resolveRiderCreature({ rider: RT_PSYK_OUT, creature: creature({ isPsyker: true, characteristic: 40 }), roll: 72, rolledRounds: 6 });
        expect(result).toMatchObject({ suffers: true, condition: 'stunned', rounds: 6 });
    });

    it('applies a no-test rider to everyone caught, for the encounter', () => {
        expect(resolveRiderCreature({ rider: TEARS, creature: creature(), roll: null, rolledRounds: null })).toMatchObject({
            affected: true,
            test: null,
            suffers: true,
            untilEncounterEnd: true,
            rounds: null,
        });
    });

    it('steps a Psychotroke failure into the effect roll (Enemies Within p.44)', () => {
        // Toughness 40 − 40 = 0 against 15: two degrees of failure.
        expect(resolveRiderCreature({ rider: PSYCHOTROKE, creature: creature({ characteristic: 40 }), roll: 15, rolledRounds: null })).toMatchObject({
            suffers: true,
            effectRollShift: 2,
            rounds: 3,
        });
    });
});
