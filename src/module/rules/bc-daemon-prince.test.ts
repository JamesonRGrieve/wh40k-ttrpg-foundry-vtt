/**
 * Tests for Black Crusade Daemon Prince ascension resolver (#182).
 *
 * Covers the RAW apotheosis gate (Infamy ≥ 100 AND Corruption ≥ 70),
 * the stat-block boost shape (Unnatural Strength/Toughness multipliers,
 * bonus wounds, fear rating, daemonic trait, condition immunities),
 * and the {@link isAscended} predicate.
 */
import { describe, expect, it } from 'vitest';
import {
    DAEMON_PRINCE_BONUS_WOUNDS,
    DAEMON_PRINCE_CORRUPTION_THRESHOLD,
    DAEMON_PRINCE_FEAR_RATING,
    DAEMON_PRINCE_IMMUNE_CONDITIONS,
    DAEMON_PRINCE_INFAMY_THRESHOLD,
    DAEMON_PRINCE_UNNATURAL_STRENGTH,
    DAEMON_PRINCE_UNNATURAL_TOUGHNESS,
    ascendCharacter,
    getDaemonPrinceBoost,
    isAscended,
    type DaemonPrinceAscension,
} from './bc-daemon-prince';

describe('bc-daemon-prince :: constants', () => {
    it('exposes RAW Unnatural Strength multiplier (x4)', () => {
        expect(DAEMON_PRINCE_UNNATURAL_STRENGTH).toBe(4);
    });

    it('exposes RAW Unnatural Toughness multiplier (x4)', () => {
        expect(DAEMON_PRINCE_UNNATURAL_TOUGHNESS).toBe(4);
    });

    it('exposes RAW Fear rating (3)', () => {
        expect(DAEMON_PRINCE_FEAR_RATING).toBe(3);
    });

    it('exposes RAW Infamy threshold (100)', () => {
        expect(DAEMON_PRINCE_INFAMY_THRESHOLD).toBe(100);
    });

    it('exposes RAW Corruption threshold (70)', () => {
        expect(DAEMON_PRINCE_CORRUPTION_THRESHOLD).toBe(70);
    });

    it('exposes a non-empty condition-immunity list', () => {
        expect(DAEMON_PRINCE_IMMUNE_CONDITIONS.length).toBeGreaterThan(0);
    });
});

describe('bc-daemon-prince :: getDaemonPrinceBoost', () => {
    const ascension: DaemonPrinceAscension = {
        ascendedAt: 12,
        alignmentAtAscension: 'khorne',
    };

    it('returns the full RAW boost shape', () => {
        const boost = getDaemonPrinceBoost(ascension);
        expect(boost).toEqual({
            strengthBonusMultiplier: DAEMON_PRINCE_UNNATURAL_STRENGTH,
            toughnessBonusMultiplier: DAEMON_PRINCE_UNNATURAL_TOUGHNESS,
            bonusWounds: DAEMON_PRINCE_BONUS_WOUNDS,
            fearRating: DAEMON_PRINCE_FEAR_RATING,
            daemonicTrait: true,
            immuneToConditions: DAEMON_PRINCE_IMMUNE_CONDITIONS,
        });
    });

    it('always grants the Daemonic trait', () => {
        expect(getDaemonPrinceBoost(ascension).daemonicTrait).toBe(true);
    });

    it('grants the same package regardless of patron alignment', () => {
        const khorne = getDaemonPrinceBoost({ ascendedAt: 1, alignmentAtAscension: 'khorne' });
        const slaanesh = getDaemonPrinceBoost({ ascendedAt: 1, alignmentAtAscension: 'slaanesh' });
        const nurgle = getDaemonPrinceBoost({ ascendedAt: 1, alignmentAtAscension: 'nurgle' });
        const tzeentch = getDaemonPrinceBoost({ ascendedAt: 1, alignmentAtAscension: 'tzeentch' });
        const unaligned = getDaemonPrinceBoost({ ascendedAt: 1, alignmentAtAscension: 'unaligned' });
        expect(khorne).toEqual(slaanesh);
        expect(khorne).toEqual(nurgle);
        expect(khorne).toEqual(tzeentch);
        expect(khorne).toEqual(unaligned);
    });
});

describe('bc-daemon-prince :: ascendCharacter', () => {
    it('ascends when infamy = 100 and corruption = 70 (exact thresholds)', () => {
        expect(ascendCharacter({ currentInfamy: 100, currentCorruption: 70, alignment: 'tzeentch' })).toEqual({
            ascended: true,
        });
    });

    it('ascends when both stats exceed the thresholds', () => {
        expect(ascendCharacter({ currentInfamy: 150, currentCorruption: 120, alignment: 'nurgle' })).toEqual({
            ascended: true,
        });
    });

    it('blocks with insufficient-infamy when infamy < 100', () => {
        expect(ascendCharacter({ currentInfamy: 99, currentCorruption: 80, alignment: 'khorne' })).toEqual({
            ascended: false,
            reason: 'insufficient-infamy',
        });
    });

    it('blocks with insufficient-corruption when corruption < 70 but infamy is sufficient', () => {
        expect(ascendCharacter({ currentInfamy: 110, currentCorruption: 69, alignment: 'slaanesh' })).toEqual({
            ascended: false,
            reason: 'insufficient-corruption',
        });
    });

    it('reports infamy first when both thresholds fail', () => {
        expect(ascendCharacter({ currentInfamy: 0, currentCorruption: 0, alignment: 'unaligned' })).toEqual({
            ascended: false,
            reason: 'insufficient-infamy',
        });
    });

    it('sanitises non-finite infamy to 0 (blocked: insufficient-infamy)', () => {
        expect(ascendCharacter({ currentInfamy: Number.NaN, currentCorruption: 80, alignment: 'khorne' })).toEqual({
            ascended: false,
            reason: 'insufficient-infamy',
        });
    });
});

describe('bc-daemon-prince :: isAscended', () => {
    it('returns false for a null record (never ascended)', () => {
        expect(isAscended(null)).toBe(false);
    });

    it('returns true for any non-null ascension record', () => {
        expect(
            isAscended({
                ascendedAt: 7,
                alignmentAtAscension: 'tzeentch',
            }),
        ).toBe(true);
    });
});
