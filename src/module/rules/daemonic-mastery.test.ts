import { describe, expect, it } from 'vitest';
import { buildDaemonicMasteryTest, DAEMONIC_MASTERY_FACTORS } from './daemonic-mastery';

describe('DAEMONIC_MASTERY_FACTORS', () => {
    it('base difficulty is −30 (Very Hard)', () => {
        expect(DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY.modifier).toBe(-30);
    });
    it('True Name is +30', () => {
        expect(DAEMONIC_MASTERY_FACTORS.TRUE_NAME.modifier).toBe(30);
    });
});

describe('buildDaemonicMasteryTest', () => {
    it('returns WP minus base difficulty when only the base factor is present', () => {
        const r = buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY] });
        expect(r.target).toBe(10);
    });

    it('True Name cancels the base difficulty', () => {
        const r = buildDaemonicMasteryTest({
            willpowerTotal: 40,
            factors: [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY, DAEMONIC_MASTERY_FACTORS.TRUE_NAME],
        });
        expect(r.target).toBe(40);
    });

    it('captures every factor in the breakdown', () => {
        const r = buildDaemonicMasteryTest({
            willpowerTotal: 40,
            factors: [
                DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY,
                DAEMONIC_MASTERY_FACTORS.TRUE_NAME,
                DAEMONIC_MASTERY_FACTORS.PROPER_COMPONENTS,
            ],
        });
        expect(r.breakdown.map((b) => b.label)).toEqual([
            'Willpower',
            DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY.label,
            DAEMONIC_MASTERY_FACTORS.TRUE_NAME.label,
            DAEMONIC_MASTERY_FACTORS.PROPER_COMPONENTS.label,
        ]);
    });

    it('clamps the target at 0 when WP is too low for the factors', () => {
        const r = buildDaemonicMasteryTest({
            willpowerTotal: 20,
            factors: [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY, DAEMONIC_MASTERY_FACTORS.MISSING_COMPONENTS],
        });
        expect(r.target).toBe(0);
    });

    it('skips zero-modifier factors in the breakdown', () => {
        const r = buildDaemonicMasteryTest({ willpowerTotal: 30, factors: [{ label: 'Filler', modifier: 0 }] });
        expect(r.breakdown.length).toBe(1);
    });
});
