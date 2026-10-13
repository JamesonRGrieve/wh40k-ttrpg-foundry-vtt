import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import type { GameSystemId } from '../config/game-systems/types.ts';
import {
    type BurstCapRules,
    type BurstInput,
    burstModeForAction,
    capBurstToShots,
    hitCeilingRows,
    hitsForDegrees,
    isBurstAction,
    resolveBurst,
} from './auto-fire';

/** A Storm Bolter: S/2/4, the canonical Storm weapon in the DH2 armoury. */
const STORM_BOLTER = { semi: 2, full: 4 };
/** An ordinary autogun-shaped profile: S/3/6. */
const AUTOGUN = { semi: 3, full: 6 };

/** A line's printed burst rule, read from its game-system config (the single source). */
function rulesOf(line: GameSystemId): BurstCapRules | null {
    return SystemConfigRegistry.get(line).burstRules;
}

/** A burst under DH2's rule — the line the original #510–#512 cases were written against. */
function dh2Burst(input: Omit<BurstInput, 'rules'>): { shotsFired: number; maxHits: number } {
    const { shotsFired, maxHits } = resolveBurst({ ...input, rules: rulesOf('dh2') });
    return { shotsFired, maxHits };
}

describe('burstModeForAction', () => {
    it('maps both burst actions to their rate-of-fire entry', () => {
        expect(burstModeForAction('Semi-Auto Burst')).toBe('semi');
        expect(burstModeForAction('Full Auto Burst')).toBe('full');
    });

    it('maps BOTH Suppressing Fire actions — omitting them is #510', () => {
        // Suppressing Fire "fires a Full Auto or Semi-Auto Burst … and expends the
        // appropriate ammo", so it draws on the same RoF entry as the burst it fired.
        expect(burstModeForAction('Suppressing Fire - Semi')).toBe('semi');
        expect(burstModeForAction('Suppressing Fire - Full')).toBe('full');
    });

    it('excludes melee multi-attacks and psychic actions, which have no rate of fire', () => {
        for (const action of ['Swift Attack', 'Lightning Attack', 'Standard Attack', 'Charge', '']) {
            expect(burstModeForAction(action)).toBeNull();
            expect(isBurstAction(action)).toBe(false);
        }
    });
});

describe('hitsForDegrees', () => {
    it('semi scores the initial DoS plus one per TWO additional', () => {
        expect(hitsForDegrees('semi', 1)).toBe(1);
        expect(hitsForDegrees('semi', 2)).toBe(1);
        expect(hitsForDegrees('semi', 3)).toBe(2);
        expect(hitsForDegrees('semi', 4)).toBe(2);
        expect(hitsForDegrees('semi', 5)).toBe(3);
    });

    it('full scores one hit per degree of success', () => {
        expect(hitsForDegrees('full', 1)).toBe(1);
        expect(hitsForDegrees('full', 2)).toBe(2);
        expect(hitsForDegrees('full', 5)).toBe(5);
    });

    it('never returns less than the single hit a success always earns', () => {
        expect(hitsForDegrees('full', 0)).toBe(1);
        expect(hitsForDegrees('semi', -3)).toBe(1);
        expect(hitsForDegrees('semi', Number.NaN)).toBe(1);
    });
});

describe('resolveBurst — ammunition vs hit ceiling', () => {
    it('fires the whole burst and caps hits at the same RoF (no Storm)', () => {
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(dh2Burst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('#511: Storm doubles the AMMUNITION but NOT the ceiling', () => {
        // "doubles the number of hits … and the amount of ammunition expended …
        // (up to the weapon's firing rate, as normal)". A Storm Bolter burns 8
        // rounds on full auto and still lands at most 4 hits — which is why it
        // ships with a 60-round clip.
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 60 })).toEqual({
            shotsFired: 8,
            maxHits: 4,
        });
        expect(dh2Burst({ action: 'Semi-Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 60 })).toEqual({
            shotsFired: 4,
            maxHits: 2,
        });
    });

    it('#510: Suppressing Fire expends the burst it fired, not one round', () => {
        expect(dh2Burst({ action: 'Suppressing Fire - Full', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(dh2Burst({ action: 'Suppressing Fire - Semi', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('#512: a weapon that consumes no ammunition still gets its RoF ceiling', () => {
        // `affordableShots: null` = no clip to draw down. The ceiling is a property
        // of the weapon's rate of fire, not of ammunition bookkeeping.
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: null })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(dh2Burst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: null })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('a burst cut short by the clip cannot land more hits than it fired shots', () => {
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 2 })).toEqual({
            shotsFired: 2,
            maxHits: 2,
        });
    });

    it('an empty clip fires nothing and scores nothing', () => {
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 0 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });

    it('a weapon with no entry for the mode fires nothing on it', () => {
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: { semi: 3, full: 0 }, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });

    it('a non-burst action is a single shot, unchanged', () => {
        expect(dh2Burst({ action: 'Standard Attack', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 1,
            maxHits: 1,
        });
        expect(dh2Burst({ action: 'Swift Attack', rateOfFire: null, storm: false, affordableShots: null })).toEqual({
            shotsFired: 1,
            maxHits: 1,
        });
    });

    it('tolerates missing or malformed rate-of-fire data rather than throwing', () => {
        expect(dh2Burst({ action: 'Full Auto Burst', rateOfFire: undefined, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });
});

/**
 * #607: the ceiling is per line. Each row is the line's printed rule (quoted on
 * its game-system config) applied to an autogun (S/3/6) and a Storm Bolter
 * (S/2/4) with a full clip, a two-round clip, and Suppressing Fire.
 */
describe('resolveBurst — the per-line ceiling (#607)', () => {
    const cases: readonly { line: GameSystemId; semi: number; full: number; storm: number }[] = [
        // DH2 core: total hits ≤ RoF; Storm "up to the weapon's firing rate, as normal".
        { line: 'dh2', semi: 3, full: 6, storm: 4 },
        // RT 1.4 errata: total hits ≤ RoF; FAQ: Storm caps at "Double the Rate of Fire".
        { line: 'rt', semi: 3, full: 6, storm: 8 },
        // BC / DW: extra hits ≤ RoF; Storm "to a maximum of twice the … rate of fire".
        { line: 'bc', semi: 4, full: 7, storm: 9 },
        { line: 'dw', semi: 4, full: 7, storm: 9 },
        // DH1 core: extra hits ≤ RoF; Ascension's Storm doubles every hit up to the RoF.
        { line: 'dh1', semi: 4, full: 7, storm: 9 },
        // OW core: extra hits ≤ RoF; Storm "up to the weapon's firing rate, as normal".
        { line: 'ow', semi: 4, full: 7, storm: 5 },
        // IM prints no burst rules: the conservative total cap.
        { line: 'im', semi: 3, full: 6, storm: 4 },
    ];

    it.each(cases)('$line: Semi-Auto Burst caps at $semi', ({ line, semi }) => {
        const burst = resolveBurst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf(line) });
        expect(burst.shotsFired).toBe(3);
        expect(burst.maxHits).toBe(semi);
    });

    it.each(cases)('$line: Full Auto Burst caps at $full', ({ line, full }) => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf(line) });
        expect(burst.shotsFired).toBe(6);
        expect(burst.maxHits).toBe(full);
    });

    it.each(cases)('$line: a Storm full-auto burst burns 8 rounds and caps at $storm', ({ line, storm }) => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 100, rules: rulesOf(line) });
        expect(burst.shotsFired).toBe(8);
        expect(burst.maxHits).toBe(storm);
    });

    it.each(cases)('$line: a burst cut short by a two-round clip lands at most 2 hits', ({ line }) => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 2, rules: rulesOf(line) });
        expect(burst.shotsFired).toBe(2);
        expect(burst.maxHits).toBe(2);
    });

    it.each(cases)('$line: Suppressing Fire caps the TOTAL hits at the rate of fire', ({ line }) => {
        // Every line prints "The number of hits scored may not exceed …" here.
        const burst = resolveBurst({ action: 'Suppressing Fire - Full', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf(line) });
        expect(burst.maxHits).toBe(6);
    });

    it.each(cases)('$line: the ceiling parts sum to the ceiling', ({ line }) => {
        for (const storm of [false, true]) {
            for (const affordableShots of [100, 2, null]) {
                const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm, affordableShots, rules: rulesOf(line) });
                expect(burst.capComponents.reduce((sum, c) => sum + c.value, 0)).toBe(burst.maxHits);
            }
        }
    });

    it('an extra-hit line names the first hit as its own part', () => {
        const burst = resolveBurst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf('bc') });
        expect(burst.capComponents).toEqual([
            { key: 'rof', value: 3 },
            { key: 'first-hit', value: 1 },
        ]);
    });

    it('a Storm weapon in a line that keeps the ceiling still shows Storm, at 0', () => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 100, rules: rulesOf('dh2') });
        expect(burst.capComponents).toEqual([
            { key: 'rof', value: 4 },
            { key: 'storm', value: 0 },
        ]);
    });
});

describe('capBurstToShots', () => {
    it('a re-rating round cuts an extra-hit ceiling to the rounds it fires, booked on the ammo part', () => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf('bc') });
        const cut = capBurstToShots(burst, 1);
        expect(cut.shotsFired).toBe(1);
        expect(cut.maxHits).toBe(1);
        expect(cut.capComponents.reduce((sum, c) => sum + c.value, 0)).toBe(1);
        expect(cut.capComponents.at(-1)).toEqual({ key: 'ammo', value: -6 });
    });

    it('leaves the burst alone when nothing cuts the rounds fired', () => {
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules: rulesOf('bc') });
        expect(capBurstToShots(burst, 6)).toBe(burst);
    });
});

describe('hitCeilingRows', () => {
    it('names the line rule on each part', () => {
        const rules = rulesOf('bc');
        const burst = resolveBurst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 100, rules });
        expect(hitCeilingRows('Full Auto Burst', burst.capComponents, rules)).toEqual([
            { key: 'rof', value: 4, labelKey: 'WH40K.Roll.HitCeiling.RateOfFireFull', sourceKey: 'WH40K.Roll.HitCeiling.SourceExtra' },
            { key: 'storm', value: 4, labelKey: 'WH40K.Roll.HitCeiling.Storm', sourceKey: 'WH40K.Roll.HitCeiling.SourceStormDouble' },
            { key: 'first-hit', value: 1, labelKey: 'WH40K.Roll.HitCeiling.FirstHit', sourceKey: 'WH40K.Roll.HitCeiling.SourceFirstHit' },
        ]);
    });

    it('cites the total cap for Suppressing Fire even in an extra-hit line', () => {
        const rules = rulesOf('ow');
        const burst = resolveBurst({ action: 'Suppressing Fire - Semi', rateOfFire: AUTOGUN, storm: false, affordableShots: 100, rules });
        expect(hitCeilingRows('Suppressing Fire - Semi', burst.capComponents, rules)[0]?.sourceKey).toBe('WH40K.Roll.HitCeiling.SourceTotal');
    });

    it('cites no printed rule for a line without one, and has no rows for a non-burst action', () => {
        expect(hitCeilingRows('Semi-Auto Burst', [{ key: 'rof', value: 3 }], null)[0]?.sourceKey).toBe('WH40K.Roll.HitCeiling.SourceUnruled');
        expect(hitCeilingRows('Standard Attack', [], rulesOf('dh2'))).toEqual([]);
    });
});
