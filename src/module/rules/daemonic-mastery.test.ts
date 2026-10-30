import { describe, expect, it } from 'vitest';
import { buildDaemonicMasteryTest, circumstanceFactor, composeRitualTest, DAEMONIC_MASTERY_FACTORS } from './daemonic-mastery';

/** Daemonic Mastery (DH2). */
describe('DAEMONIC_MASTERY_FACTORS', () => {
    it('carries exactly the printed factors', () => {
        expect(DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY.modifier).toBe(-30);
        expect(DAEMONIC_MASTERY_FACTORS.TRUE_NAME.modifier).toBe(30);
        expect(DAEMONIC_MASTERY_FACTORS.PATRON_SERVANT.modifier).toBe(10);
        expect(DAEMONIC_MASTERY_FACTORS.AGAINST_NATURE.modifier).toBe(-30);
        // Regression: invented "ritual components" / "consecrated ground" factors are not printed.
        expect(Object.keys(DAEMONIC_MASTERY_FACTORS).sort()).toEqual(['AGAINST_NATURE', 'BASE_DIFFICULTY', 'PATRON_SERVANT', 'TRUE_NAME']);
    });

    it('labels every factor through the langpack', () => {
        for (const factor of Object.values(DAEMONIC_MASTERY_FACTORS)) expect(factor.labelKey).toMatch(/^WH40K\.Daemonology\.Factor\./);
    });
});

describe('buildDaemonicMasteryTest', () => {
    it('always applies the Very Hard base', () => {
        const r = buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [] });
        expect(r.base).toBe(40);
        expect(r.target).toBe(10);
        expect(r.components.map((c) => c.id)).toEqual(['base-difficulty']);
    });

    it('True Name cancels the base difficulty', () => {
        expect(buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [DAEMONIC_MASTERY_FACTORS.TRUE_NAME] }).target).toBe(40);
    });

    it('records one provenance row per factor, in order', () => {
        const r = buildDaemonicMasteryTest({ willpowerTotal: 40, factors: [DAEMONIC_MASTERY_FACTORS.PATRON_SERVANT, DAEMONIC_MASTERY_FACTORS.TRUE_NAME] });
        expect(r.components.map((c) => [c.id, c.value])).toEqual([
            ['base-difficulty', -30],
            ['patron-servant', 10],
            ['true-name', 30],
        ]);
    });

    it('floors the target at 0', () => {
        expect(buildDaemonicMasteryTest({ willpowerTotal: 20, factors: [DAEMONIC_MASTERY_FACTORS.AGAINST_NATURE] }).target).toBe(0);
    });
});

describe('composeRitualTest', () => {
    it('drops zero-valued factors', () => {
        const r = composeRitualTest(30, [circumstanceFactor('gm', 'Nothing', 0)]);
        expect(r.components).toHaveLength(0);
        expect(r.target).toBe(30);
    });

    it('caps the modifier sum at ±60 and reports it', () => {
        const r = composeRitualTest(50, [
            { id: 'a', labelKey: 'k', modifier: -60 },
            { id: 'b', labelKey: 'k', modifier: -30 },
        ]);
        expect(r.rawModifierTotal).toBe(-90);
        expect(r.modifierTotal).toBe(-60);
        expect(r.capFired).toBe(true);
        expect(r.target).toBe(0);
    });

    it('keeps two rows that share an id', () => {
        const r = composeRitualTest(40, [circumstanceFactor('gm', 'A', 10), circumstanceFactor('gm', 'B', 5)]);
        expect(r.target).toBe(55);
    });
});

describe('circumstanceFactor', () => {
    it('carries a trimmed GM label and truncates the value', () => {
        expect(circumstanceFactor('gm-1', '  Blood sacrifice ', 10.7)).toEqual({
            id: 'gm-1',
            labelKey: 'WH40K.Daemonology.Factor.Circumstance',
            modifier: 10,
            label: 'Blood sacrifice',
        });
    });

    it('omits an empty label and zeroes a non-finite value', () => {
        expect(circumstanceFactor('gm-1', '', Number.NaN)).toEqual({ id: 'gm-1', labelKey: 'WH40K.Daemonology.Factor.Circumstance', modifier: 0 });
    });
});
