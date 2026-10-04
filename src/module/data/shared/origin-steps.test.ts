import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { originStepLabel } from './origin-steps';

/**
 * Pins the shared origin-step labelling (formerly duplicated between
 * CharacterData._getStepLabel and OriginPathData.stepLabel). Labels resolve
 * through the real English langpack.
 */
describe('originStepLabel', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: buildLangStub() });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('covers the RT + DH2e + BC + OW/DW step keys', () => {
        const expected = {
            homeWorld: 'Home World',
            lureOfTheVoid: 'Lure of the Void',
            career: 'Career',
            background: 'Background',
            archetype: 'Archetype',
            regiment: 'Regiment',
            lineage: 'Lineage',
        };
        const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, originStepLabel(key)]));
        expect(actual).toEqual(expected);
    });

    it('maps both elite aliases to "Elite Advance"', () => {
        expect(originStepLabel('elite')).toBe('Elite Advance');
        expect(originStepLabel('eliteAdvance')).toBe('Elite Advance');
    });

    it('falls back to the raw key for an unknown step and to empty for none', () => {
        expect(originStepLabel('madeUpStep')).toBe('madeUpStep');
        expect(originStepLabel('')).toBe('');
    });
});
