import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_FOOTPRINT, prototypeTokenFootprintUpdate, tokenFootprintForSize, tokenPresetFromActor } from './token-footprint.ts';

describe('tokenFootprintForSize', () => {
    it('maps the whole 1-10 size scale', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(tokenFootprintForSize)).toEqual([0.5, 0.75, 1, 1, 2, 2, 3, 3, 4, 4]);
    });

    it('sizes a Hulking creature at 2x2 — bigger than an Average PC, not equal', () => {
        // #501: the aberrants are size 5 and arrived 1x1 because the ladder
        // only ever ran from the NPC sheet.
        expect(tokenFootprintForSize(5)).toBe(2);
        expect(tokenFootprintForSize(4)).toBe(1);
    });

    it('falls back to 1x1 for absent, non-numeric or off-scale sizes', () => {
        expect(tokenFootprintForSize(undefined)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(null)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize('5')).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(Number.NaN)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(0)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(11)).toBe(DEFAULT_TOKEN_FOOTPRINT);
    });
});

describe('prototypeTokenFootprintUpdate', () => {
    it('emits square dotted-path token dimensions', () => {
        expect(prototypeTokenFootprintUpdate(6)).toEqual({
            'prototypeToken.width': 2,
            'prototypeToken.height': 2,
        });
    });

    it('emits the default footprint when the size is unusable', () => {
        expect(prototypeTokenFootprintUpdate(undefined)).toEqual({
            'prototypeToken.width': 1,
            'prototypeToken.height': 1,
        });
    });
});

describe('tokenPresetFromActor', () => {
    it('grows a default 1x1 token to its size footprint (a Chimera at size 7 → 3x3)', () => {
        expect(tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 7, actorType: 'dh2-terracraft', sightEnabled: true })).toMatchObject({
            width: 3,
            height: 3,
        });
    });

    it('enables vision for a vehicle whose sight is off', () => {
        const update = tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 6, actorType: 'dh2-terracraft', sightEnabled: false });
        expect(update['sight.enabled']).toBe(true);
        expect(update).toMatchObject({ width: 2, height: 2 });
    });

    it('leaves a hand-resized token (already non-1x1) alone', () => {
        expect(tokenPresetFromActor({ currentWidth: 4, currentHeight: 4, size: 7, actorType: 'dh2-terracraft', sightEnabled: true })).toEqual({});
    });

    it('does not resize a size that maps to 1x1, and does not touch non-vehicle vision', () => {
        expect(tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 4, actorType: 'dh2-npc', sightEnabled: false })).toEqual({});
    });

    it('does not re-enable vision that is already on', () => {
        expect(tokenPresetFromActor({ currentWidth: 3, currentHeight: 3, size: 7, actorType: 'dh2-terracraft', sightEnabled: true })).toEqual({});
    });
});
