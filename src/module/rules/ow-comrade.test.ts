import { describe, expect, it } from 'vitest';
import {
    COMRADE_COHESION_RANGE_M,
    COMRADE_CORRUPTION_DEATH_THRESHOLD,
    COMRADE_INSANITY_DEATH_THRESHOLD,
    applyComradeHit,
    comradeDiesFromMentalDamage,
    comradeMirrorsFearPinning,
    healComrade,
    inCohesion,
    replaceComrade,
    transfersToComrade,
} from './ow-comrade';

describe('ow-comrade — constants', () => {
    it('publishes the RAW Cohesion radius of 5 metres', () => {
        expect(COMRADE_COHESION_RANGE_M).toBe(5);
    });

    it('publishes the RAW mental-damage death thresholds at 10 each', () => {
        expect(COMRADE_INSANITY_DEATH_THRESHOLD).toBe(10);
        expect(COMRADE_CORRUPTION_DEATH_THRESHOLD).toBe(10);
    });
});

describe('ow-comrade — inCohesion', () => {
    it('is true inside the 5 m radius with visual line', () => {
        expect(inCohesion({ distanceM: 4, hasVisualLine: true })).toBe(true);
    });

    it('is true exactly at the 5 m boundary (inclusive)', () => {
        expect(inCohesion({ distanceM: 5, hasVisualLine: true })).toBe(true);
    });

    it('is false past the 5 m boundary', () => {
        expect(inCohesion({ distanceM: 6, hasVisualLine: true })).toBe(false);
    });

    it('is false without visual line even at 0 m', () => {
        expect(inCohesion({ distanceM: 0, hasVisualLine: false })).toBe(false);
    });

    it('coerces negative distance to 0 and still treats as in-Cohesion when visible', () => {
        expect(inCohesion({ distanceM: -3, hasVisualLine: true })).toBe(true);
    });

    it('coerces non-finite distance to 0 and still treats as in-Cohesion when visible', () => {
        expect(inCohesion({ distanceM: Number.NaN, hasVisualLine: true })).toBe(true);
        expect(inCohesion({ distanceM: Number.POSITIVE_INFINITY, hasVisualLine: true })).toBe(true);
    });
});

describe('ow-comrade — state-track transitions', () => {
    describe('applyComradeHit', () => {
        it('advances unharmed → wounded', () => {
            expect(applyComradeHit('unharmed')).toEqual({ newState: 'wounded', transitioned: true });
        });

        it('advances wounded → dead', () => {
            expect(applyComradeHit('wounded')).toEqual({ newState: 'dead', transitioned: true });
        });

        it('keeps dead at dead as a no-op', () => {
            expect(applyComradeHit('dead')).toEqual({ newState: 'dead', transitioned: false });
        });
    });

    describe('healComrade', () => {
        it('reverts wounded → unharmed', () => {
            expect(healComrade('wounded')).toEqual({ newState: 'unharmed', transitioned: true });
        });

        it('does nothing for an already unharmed Comrade', () => {
            expect(healComrade('unharmed')).toEqual({ newState: 'unharmed', transitioned: false });
        });

        it('does nothing for a dead Comrade (replacement, not healing)', () => {
            expect(healComrade('dead')).toEqual({ newState: 'dead', transitioned: false });
        });
    });

    describe('replaceComrade', () => {
        it('replaces a dead Comrade when a replacement is available', () => {
            expect(replaceComrade('dead', true)).toEqual({
                newState: 'unharmed',
                transitioned: true,
                replaced: true,
            });
        });

        it('does not replace a dead Comrade when no replacement is available', () => {
            expect(replaceComrade('dead', false)).toEqual({
                newState: 'dead',
                transitioned: false,
                replaced: false,
            });
        });

        it('does not replace a wounded Comrade even when a replacement is available', () => {
            expect(replaceComrade('wounded', true)).toEqual({
                newState: 'wounded',
                transitioned: false,
                replaced: false,
            });
        });

        it('does not replace an unharmed Comrade even when a replacement is available', () => {
            expect(replaceComrade('unharmed', true)).toEqual({
                newState: 'unharmed',
                transitioned: false,
                replaced: false,
            });
        });
    });
});

describe('ow-comrade — transfersToComrade', () => {
    it('transfers on doubles when the Comrade is in Cohesion', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: true,
                comradeInCohesion: true,
                weaponBlastOrSpray: false,
                comradeInBlastSprayRange: false,
            }),
        ).toEqual({ transfers: true, reason: 'doubles' });
    });

    it('does not transfer on doubles when the Comrade is out of Cohesion', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: true,
                comradeInCohesion: false,
                weaponBlastOrSpray: false,
                comradeInBlastSprayRange: false,
            }),
        ).toEqual({ transfers: false, reason: 'none' });
    });

    it('transfers on Blast / Spray when the Comrade is in the footprint', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: false,
                comradeInCohesion: false,
                weaponBlastOrSpray: true,
                comradeInBlastSprayRange: true,
            }),
        ).toEqual({ transfers: true, reason: 'blast-spray' });
    });

    it('does not transfer on Blast / Spray when the Comrade is outside the footprint', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: false,
                comradeInCohesion: true,
                weaponBlastOrSpray: true,
                comradeInBlastSprayRange: false,
            }),
        ).toEqual({ transfers: false, reason: 'none' });
    });

    it('does not transfer when the PC did not roll doubles and the weapon is not Blast / Spray', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: false,
                comradeInCohesion: true,
                weaponBlastOrSpray: false,
                comradeInBlastSprayRange: true,
            }),
        ).toEqual({ transfers: false, reason: 'none' });
    });

    it('reports doubles first when both triggers fire (single transferred hit)', () => {
        expect(
            transfersToComrade({
                pcRollDoubles: true,
                comradeInCohesion: true,
                weaponBlastOrSpray: true,
                comradeInBlastSprayRange: true,
            }),
        ).toEqual({ transfers: true, reason: 'doubles' });
    });
});

describe('ow-comrade — comradeMirrorsFearPinning', () => {
    it('mirrors a failed Fear test when the Comrade is in Cohesion', () => {
        expect(
            comradeMirrorsFearPinning({
                pcFailedFear: true,
                pcPinned: false,
                comradeInCohesion: true,
            }),
        ).toEqual({ failsFear: true, pinned: false });
    });

    it('mirrors Pinned when the Comrade is in Cohesion', () => {
        expect(
            comradeMirrorsFearPinning({
                pcFailedFear: false,
                pcPinned: true,
                comradeInCohesion: true,
            }),
        ).toEqual({ failsFear: false, pinned: true });
    });

    it('mirrors both Fear and Pinning together when applicable', () => {
        expect(
            comradeMirrorsFearPinning({
                pcFailedFear: true,
                pcPinned: true,
                comradeInCohesion: true,
            }),
        ).toEqual({ failsFear: true, pinned: true });
    });

    it('does not mirror when the Comrade is out of Cohesion', () => {
        expect(
            comradeMirrorsFearPinning({
                pcFailedFear: true,
                pcPinned: true,
                comradeInCohesion: false,
            }),
        ).toEqual({ failsFear: false, pinned: false });
    });

    it('mirrors a passed PC Fear test as Comrade-passes (failsFear: false) in Cohesion', () => {
        expect(
            comradeMirrorsFearPinning({
                pcFailedFear: false,
                pcPinned: false,
                comradeInCohesion: true,
            }),
        ).toEqual({ failsFear: false, pinned: false });
    });
});

describe('ow-comrade — comradeDiesFromMentalDamage', () => {
    it('kills the Comrade at 10 Insanity in a round', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 10, corruptionThisRound: 0 })).toBe(true);
    });

    it('kills the Comrade at 10 Corruption in a round', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 0, corruptionThisRound: 10 })).toBe(true);
    });

    it('kills the Comrade when either threshold is crossed independently', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 12, corruptionThisRound: 0 })).toBe(true);
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 0, corruptionThisRound: 15 })).toBe(true);
    });

    it('does not kill the Comrade at 9 of either', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 9, corruptionThisRound: 9 })).toBe(false);
    });

    it('does not kill the Comrade at zero damage', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 0, corruptionThisRound: 0 })).toBe(false);
    });

    it('coerces negative and non-finite inputs to zero', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: -5, corruptionThisRound: -5 })).toBe(false);
        expect(comradeDiesFromMentalDamage({ insanityThisRound: Number.NaN, corruptionThisRound: 0 })).toBe(false);
    });

    it('floors fractional inputs (9.9 Insanity is still under threshold)', () => {
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 9.9, corruptionThisRound: 0 })).toBe(false);
        expect(comradeDiesFromMentalDamage({ insanityThisRound: 10.7, corruptionThisRound: 0 })).toBe(true);
    });
});
