/**
 * Regression tests for the DH2e character-generation defaults (#223).
 *
 * Point-buy generation must reflect DH2e RAW: a 60-point pool over a base of 25
 * (the FFG d100 family is 2d10+25). Both getters fall back to their defaults
 * when `game.settings` is unavailable (as in this unit env), so these assert the
 * RAW values directly.
 */

import { describe, expect, it } from 'vitest';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

describe('WH40KSettings generation defaults (#223)', () => {
    it('characteristic base defaults to 25 (FFG d100 2d10+25)', () => {
        expect(WH40KSettings.getCharacteristicBase()).toBe(25);
    });

    it('point-buy pool defaults to 60', () => {
        expect(WH40KSettings.getCharacteristicPointBuyPool()).toBe(60);
    });
});
