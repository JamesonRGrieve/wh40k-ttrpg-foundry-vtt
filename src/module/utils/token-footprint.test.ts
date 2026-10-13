import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TOKEN_FOOTPRINT,
    dimensionFootprint,
    hasAuthoredFootprint,
    legacyFootprintUpgrade,
    metresToSceneUnits,
    prototypeTokenFootprintUpdate,
    tokenFootprintForSize,
    tokenPresetFromActor,
} from './token-footprint.ts';

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

describe('metresToSceneUnits', () => {
    it('treats metres, a blank unit and unknown units as metric', () => {
        expect(metresToSceneUnits(7, 'm')).toBe(7);
        expect(metresToSceneUnits(7, '')).toBe(7);
        expect(metresToSceneUnits(7, null)).toBe(7);
        expect(metresToSceneUnits(7, 'parsecs')).toBe(7);
    });

    it('converts to feet', () => {
        expect(metresToSceneUnits(1, 'ft')).toBeCloseTo(3.28084, 5);
        expect(metresToSceneUnits(1, ' Feet ')).toBeCloseTo(3.28084, 5);
    });
});

describe('dimensionFootprint', () => {
    const metreGrid = { distance: 1, units: 'm' };

    it('lays a vehicle lengthwise: 6.9 m x 4.6 m on a 1 m grid → 7 x 5 cells', () => {
        expect(dimensionFootprint({ length: 6.9, width: 4.6 }, metreGrid)).toEqual({ width: 7, height: 5 });
    });

    it('scales to the grid distance (2 m per cell → 3 x 2)', () => {
        expect(dimensionFootprint({ length: 6.9, width: 4.6 }, { distance: 2, units: 'm' })).toEqual({ width: 3, height: 2 });
    });

    it('honours a feet grid (5 ft per cell)', () => {
        expect(dimensionFootprint({ length: 6.9, width: 4.6 }, { distance: 5, units: 'ft' })).toEqual({ width: 5, height: 3 });
    });

    it('never goes below one cell', () => {
        expect(dimensionFootprint({ length: 0.4, width: 0.3 }, { distance: 2, units: 'm' })).toEqual({ width: 1, height: 1 });
    });

    it('returns null without both dimensions or a usable grid', () => {
        expect(dimensionFootprint({ length: 6.9, width: null }, metreGrid)).toBeNull();
        expect(dimensionFootprint(null, metreGrid)).toBeNull();
        expect(dimensionFootprint({ length: 6.9, width: 4.6 }, null)).toBeNull();
        expect(dimensionFootprint({ length: 6.9, width: 4.6 }, { distance: 0, units: 'm' })).toBeNull();
    });
});

describe('tokenPresetFromActor', () => {
    const metreGrid = { distance: 1, units: 'm' };

    it('grows a default 1x1 token to its size footprint (size 7 → 3x3)', () => {
        expect(tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 7 })).toEqual({ width: 3, height: 3 });
    });

    it('prefers authored dimensions over the size ladder', () => {
        expect(tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 7, dimensions: { length: 6.9, width: 4.6 }, grid: metreGrid })).toEqual({
            width: 7,
            height: 5,
        });
    });

    it('replaces the square ladder stamp the actor _preCreate wrote with the dimension footprint', () => {
        expect(tokenPresetFromActor({ currentWidth: 3, currentHeight: 3, size: 7, dimensions: { length: 6.9, width: 4.6 }, grid: metreGrid })).toEqual({
            width: 7,
            height: 5,
        });
    });

    it('leaves a hand-resized token alone', () => {
        expect(tokenPresetFromActor({ currentWidth: 4, currentHeight: 4, size: 7, dimensions: { length: 6.9, width: 4.6 }, grid: metreGrid })).toEqual({});
    });

    it('overwrites a hand-resized token when forced', () => {
        expect(tokenPresetFromActor({ currentWidth: 4, currentHeight: 4, size: 7, force: true })).toEqual({ width: 3, height: 3 });
    });

    it('is empty when the footprint already matches', () => {
        expect(tokenPresetFromActor({ currentWidth: 1, currentHeight: 1, size: 4 })).toEqual({});
        expect(tokenPresetFromActor({ currentWidth: 3, currentHeight: 3, size: 7 })).toEqual({});
    });
});

describe('hasAuthoredFootprint', () => {
    it('treats an explicit 1×1 (Foundry default, written verbatim by importers and the pack compiler) as unauthored (#501)', () => {
        expect(hasAuthoredFootprint({ prototypeToken: { width: 1, height: 1 } })).toBe(false);
        expect(hasAuthoredFootprint({ prototypeToken: { width: 1 } })).toBe(false);
    });

    it('treats any non-default dimension as authored', () => {
        expect(hasAuthoredFootprint({ prototypeToken: { width: 3, height: 3 } })).toBe(true);
        expect(hasAuthoredFootprint({ prototypeToken: { width: 1, height: 2 } })).toBe(true);
    });

    it('is false for a payload without a prototype token', () => {
        expect(hasAuthoredFootprint({})).toBe(false);
        expect(hasAuthoredFootprint(null)).toBe(false);
        expect(hasAuthoredFootprint({ prototypeToken: null })).toBe(false);
    });
});

describe('legacyFootprintUpgrade (#501 migration)', () => {
    const metreGrid = { distance: 1, units: 'm' };

    it('grows a 1×1 Hulking-and-larger token to its ladder footprint', () => {
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: 5 })).toEqual({ width: 2, height: 2 });
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: 6 })).toEqual({ width: 2, height: 2 });
    });

    it('uses authored dimensions on the scene grid when present', () => {
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: 7, dimensions: { length: 6.9, width: 4.6 }, grid: metreGrid })).toEqual({
            width: 7,
            height: 5,
        });
    });

    it('skips size ≤ 4, even with authored dimensions', () => {
        for (const size of [1, 2, 3, 4]) expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size })).toBeNull();
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: 4, dimensions: { length: 6, width: 4 }, grid: metreGrid })).toBeNull();
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: null })).toBeNull();
    });

    it('never touches a token that is not at the 1×1 default (hand-resized or already sized)', () => {
        expect(legacyFootprintUpgrade({ currentWidth: 3, currentHeight: 3, size: 5 })).toBeNull();
        expect(legacyFootprintUpgrade({ currentWidth: 2, currentHeight: 2, size: 5 })).toBeNull();
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 2, size: 6 })).toBeNull();
    });

    it('is null when the authored dimensions round to 1×1 anyway', () => {
        expect(legacyFootprintUpgrade({ currentWidth: 1, currentHeight: 1, size: 5, dimensions: { length: 1, width: 1 }, grid: metreGrid })).toBeNull();
    });
});
