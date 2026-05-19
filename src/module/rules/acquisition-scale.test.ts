import { describe, expect, it } from 'vitest';
import {
    ACQUISITION_AVAILABILITY_MODIFIERS,
    ACQUISITION_CRAFTSMANSHIP_MODIFIERS,
    ACQUISITION_SCALE_MODIFIERS,
    combineAvailabilityModifier,
    normaliseAvailability,
    normaliseCraftsmanship,
    normaliseScale,
    resolveAcquisitionTest,
} from './acquisition-scale';

/* -------------------------------------------------------------- */
/*  Table integrity                                               */
/* -------------------------------------------------------------- */

describe('Acquisition modifier tables (RT Table 9-35)', () => {
    it('Availability spans +70 (Ubiquitous) to −70 (Unique)', () => {
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.ubiquitous).toBe(70);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.abundant).toBe(50);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.plentiful).toBe(30);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.common).toBe(20);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.average).toBe(10);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.scarce).toBe(0);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.rare).toBe(-10);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.veryRare).toBe(-20);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.extremelyRare).toBe(-30);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.nearUnique).toBe(-50);
        expect(ACQUISITION_AVAILABILITY_MODIFIERS.unique).toBe(-70);
    });

    it('Scale spans +30 (Negligible) to −30 (Vast) with Standard at 0', () => {
        expect(ACQUISITION_SCALE_MODIFIERS.negligible).toBe(30);
        expect(ACQUISITION_SCALE_MODIFIERS.trivial).toBe(20);
        expect(ACQUISITION_SCALE_MODIFIERS.minor).toBe(10);
        expect(ACQUISITION_SCALE_MODIFIERS.standard).toBe(0);
        expect(ACQUISITION_SCALE_MODIFIERS.major).toBe(-10);
        expect(ACQUISITION_SCALE_MODIFIERS.significant).toBe(-20);
        expect(ACQUISITION_SCALE_MODIFIERS.vast).toBe(-30);
    });

    it('Craftsmanship Best is −30 (RT) not −20 (DH2)', () => {
        expect(ACQUISITION_CRAFTSMANSHIP_MODIFIERS.poor).toBe(10);
        expect(ACQUISITION_CRAFTSMANSHIP_MODIFIERS.common).toBe(0);
        expect(ACQUISITION_CRAFTSMANSHIP_MODIFIERS.good).toBe(-10);
        expect(ACQUISITION_CRAFTSMANSHIP_MODIFIERS.best).toBe(-30);
    });
});

/* -------------------------------------------------------------- */
/*  Normalisation                                                 */
/* -------------------------------------------------------------- */

describe('Availability normalisation (handles ship-component enums + RAW Title-Case)', () => {
    it('accepts hyphenated "very-rare" → veryRare', () => {
        expect(normaliseAvailability('very-rare')).toBe('veryRare');
    });
    it('accepts spaced "Very Rare" → veryRare', () => {
        expect(normaliseAvailability('Very Rare')).toBe('veryRare');
    });
    it('accepts camelCase "veryRare" → veryRare', () => {
        expect(normaliseAvailability('veryRare')).toBe('veryRare');
    });
    it('accepts mixed-case "extremely_rare" → extremelyRare', () => {
        expect(normaliseAvailability('extremely_rare')).toBe('extremelyRare');
    });
    it('returns null for unknown input', () => {
        expect(normaliseAvailability('xyz')).toBeNull();
        expect(normaliseAvailability(null)).toBeNull();
        expect(normaliseAvailability(undefined)).toBeNull();
    });
});

describe('Craftsmanship + Scale normalisation', () => {
    it('craftsmanship: trim + case-insensitive', () => {
        expect(normaliseCraftsmanship('  Best  ')).toBe('best');
        expect(normaliseCraftsmanship('GOOD')).toBe('good');
        expect(normaliseCraftsmanship('zzz')).toBeNull();
    });
    it('scale: "Significan" (source typo) and "significant" both resolve', () => {
        expect(normaliseScale('Significan')).toBe('significant');
        expect(normaliseScale('significant')).toBe('significant');
        expect(normaliseScale('Vast')).toBe('vast');
        expect(normaliseScale('negligible')).toBe('negligible');
        expect(normaliseScale('huge')).toBeNull();
    });
});

/* -------------------------------------------------------------- */
/*  Combining Acquisitions                                        */
/* -------------------------------------------------------------- */

describe('combineAvailabilityModifier (RT core.md §12226)', () => {
    it('empty input → all zeros', () => {
        const r = combineAvailabilityModifier({ components: [] });
        expect(r.baseModifier).toBe(0);
        expect(r.combinePenalty).toBe(0);
        expect(r.total).toBe(0);
        expect(r.extraComponents).toBe(0);
    });

    it('single component → no combine penalty (Rare = −10 alone)', () => {
        const r = combineAvailabilityModifier({ components: ['rare'] });
        // Single Rare component: base = -10, no extras.
        expect(r.baseModifier).toBe(-10);
        expect(r.combinePenalty).toBe(0);
        expect(r.total).toBe(-10);
        expect(r.extraComponents).toBe(0);
    });

    it('autogun (Average +10) + fire selector (Scarce 0) → base = Scarce (0), extras = 1, total = −5', () => {
        // Mirrors the Herodor combining example in the SRD prose. Greatest
        // *penalty* (lowest mod) is the Scarce component at 0; one extra
        // component beyond the first contributes −5.
        const r = combineAvailabilityModifier({ components: ['average', 'scarce'] });
        expect(r.baseModifier).toBe(0);
        expect(r.combinePenalty).toBe(-5);
        expect(r.total).toBe(-5);
        expect(r.extraComponents).toBe(1);
    });

    it('three components: takes the lowest, penalty scales linearly (−5 × 2)', () => {
        // Plentiful (+30), Rare (−10), Average (+10) → base = Rare (−10), extras = 2, penalty = −10.
        const r = combineAvailabilityModifier({ components: ['plentiful', 'rare', 'average'] });
        expect(r.baseModifier).toBe(-10);
        expect(r.combinePenalty).toBe(-10);
        expect(r.total).toBe(-20);
        expect(r.extraComponents).toBe(2);
    });
});

/* -------------------------------------------------------------- */
/*  Resolver                                                      */
/* -------------------------------------------------------------- */

describe('resolveAcquisitionTest — composition order matches RT example', () => {
    it('Herodor: PF 40, Rare hellpistol, Good craft, Negligible scale → target 50', () => {
        // SRD example: −10 (Rare) + −10 (Good) + +30 (Negligible) = +10 → 40+10 = 50.
        const r = resolveAcquisitionTest({
            profitFactor: 40,
            availability: 'rare',
            craftsmanship: 'good',
            scale: 'negligible',
        });
        expect(r.totalModifier).toBe(10);
        expect(r.target).toBe(50);
        expect(r.autoSuccess).toBe(false);
        expect(r.autoFail).toBe(false);
    });

    it('defaults craftsmanship to common (+0) and scale to negligible (+30)', () => {
        const r = resolveAcquisitionTest({ profitFactor: 40, availability: 'common' });
        // 40 + 20 + 0 + 30 = 90.
        expect(r.target).toBe(90);
        expect(r.totalModifier).toBe(50);
    });

    it('extra modifier composes additively (Commerce +2 example)', () => {
        const r = resolveAcquisitionTest({
            profitFactor: 40,
            availability: 'common',
            scale: 'negligible',
            extra: 2,
        });
        // 40 + 20 + 0 + 30 + 2 = 92.
        expect(r.target).toBe(92);
    });
});

describe('resolveAcquisitionTest — auto-success at PF ≥ 100', () => {
    it('Herodor stub auto + Plentiful + Common + Negligible → 100, autoSuccess', () => {
        // SRD example: 40 + 30 (Plentiful) + 0 (Common) + 30 (Negligible) = 100.
        const r = resolveAcquisitionTest({
            profitFactor: 40,
            availability: 'plentiful',
            craftsmanship: 'common',
            scale: 'negligible',
        });
        expect(r.target).toBe(100);
        expect(r.autoSuccess).toBe(true);
        expect(r.autoFail).toBe(false);
    });

    it('autoSuccess persists above 100', () => {
        const r = resolveAcquisitionTest({
            profitFactor: 80,
            availability: 'ubiquitous',
            scale: 'negligible',
        });
        // 80 + 70 + 0 + 30 = 180.
        expect(r.target).toBe(180);
        expect(r.autoSuccess).toBe(true);
    });
});

describe('resolveAcquisitionTest — auto-fail at PF ≤ 0', () => {
    it('Low PF + Unique + Best + Vast tanks below 0', () => {
        // 10 + (−70) + (−30) + (−30) = −120.
        const r = resolveAcquisitionTest({
            profitFactor: 10,
            availability: 'unique',
            craftsmanship: 'best',
            scale: 'vast',
        });
        expect(r.target).toBe(-120);
        expect(r.autoFail).toBe(true);
        expect(r.autoSuccess).toBe(false);
    });

    it('Exactly 0 is still auto-fail (boundary)', () => {
        // 30 + (−30) + 0 + 0 = 0.
        const r = resolveAcquisitionTest({
            profitFactor: 30,
            availability: 'extremelyRare',
            scale: 'standard',
        });
        expect(r.target).toBe(0);
        expect(r.autoFail).toBe(true);
    });
});

describe('resolveAcquisitionTest — combining acquisitions integrates with the resolver', () => {
    it('combined laspistol + red-dot composes with craft/scale/PF', () => {
        // laspistol (Common +20) + red-dot (Scarce 0) → base 0, extras = 1, penalty −5.
        // PF 50 + (−5) + 0 (Common craft) + 30 (Negligible) = 75.
        const r = resolveAcquisitionTest({
            profitFactor: 50,
            components: ['common', 'scarce'],
            craftsmanship: 'common',
            scale: 'negligible',
        });
        expect(r.totalModifier).toBe(25);
        expect(r.target).toBe(75);
        expect(r.breakdown.some((b) => b.labelKey === 'WH40K.AcquisitionScale.CombinePenalty')).toBe(true);
    });

    it('components override availability when both passed', () => {
        const r = resolveAcquisitionTest({
            profitFactor: 50,
            availability: 'unique', // ignored
            components: ['common'],
            craftsmanship: 'common',
            scale: 'negligible',
        });
        // Single component, no combine penalty: 50 + 20 + 0 + 30 = 100 (autoSuccess).
        expect(r.target).toBe(100);
        expect(r.autoSuccess).toBe(true);
    });

    it('breakdown surfaces Availability + Craftsmanship + Scale rows in order', () => {
        const r = resolveAcquisitionTest({
            profitFactor: 40,
            availability: 'rare',
            craftsmanship: 'good',
            scale: 'negligible',
            extra: -5,
        });
        const keys = r.breakdown.map((b) => b.labelKey);
        expect(keys).toEqual([
            'WH40K.AcquisitionScale.Availability',
            'WH40K.AcquisitionScale.Craftsmanship',
            'WH40K.AcquisitionScale.Scale',
            'WH40K.AcquisitionScale.Extra',
        ]);
    });
});
