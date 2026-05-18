import { describe, expect, it } from 'vitest';
import { ORIGIN_STEP_LABELS } from './origin-steps';

/**
 * Pins the shared origin-step label map (formerly duplicated between
 * CharacterData._getStepLabel and OriginPathData.stepLabel). The
 * localization wrapper itself needs the Foundry `game.i18n` runtime and is
 * exercised by the DataModel integration coverage.
 */
describe('ORIGIN_STEP_LABELS', () => {
    it('covers the RT + DH2e + BC + OW/DW step keys with English fallbacks', () => {
        for (const [key, label] of Object.entries({
            homeWorld: 'Home World',
            lureOfTheVoid: 'Lure of the Void',
            career: 'Career',
            background: 'Background',
            archetype: 'Archetype',
            regiment: 'Regiment',
        })) {
            expect(ORIGIN_STEP_LABELS[key]).toBe(label);
        }
    });

    it('maps both elite aliases to "Elite Advance"', () => {
        expect(ORIGIN_STEP_LABELS['elite']).toBe('Elite Advance');
        expect(ORIGIN_STEP_LABELS['eliteAdvance']).toBe('Elite Advance');
    });
});
