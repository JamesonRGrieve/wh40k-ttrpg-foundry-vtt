import { describe, expect, it } from 'vitest';
import {
    APPLY_CONDITION_BEHAVIOR,
    type AreaRegionSpec,
    areaExpired,
    areaExpiry,
    areaOutline,
    areaRegionData,
    areaShapeFromInputs,
    bearingBetween,
    isAreaShapeKind,
    regionShapeData,
    shapeIsAimed,
} from './area-region.ts';

/** #758: every area the system places is a V14 Region it builds itself. */
const PPU = 100;

function spec(overrides: Partial<AreaRegionSpec> = {}): AreaRegionSpec {
    return {
        name: 'Blind Grenade',
        shape: { kind: 'circle', radius: 2 },
        origin: { x: 500, y: 400 },
        rotation: 0,
        blocksSight: true,
        condition: '',
        source: 'smoke',
        color: '#888888',
        ...overrides,
    };
}

describe('regionShapeData', () => {
    it('sizes a circle in pixels from metres', () => {
        expect(regionShapeData({ kind: 'circle', radius: 2 }, { x: 5, y: 6 }, 0, PPU)).toEqual({ type: 'circle', x: 5, y: 6, radius: 200 });
    });

    it('gives a cone its length as a pixel radius, its opening and its bearing', () => {
        expect(regionShapeData({ kind: 'cone', length: 20, angle: 30 }, { x: 0, y: 0 }, 90, PPU)).toEqual({
            type: 'cone',
            x: 0,
            y: 0,
            radius: 2000,
            angle: 30,
            rotation: 90,
            curvature: 'round',
        });
    });

    it('sizes a line and a centred rectangle in pixels', () => {
        expect(regionShapeData({ kind: 'line', length: 10, width: 1 }, { x: 0, y: 0 }, 45, PPU)).toEqual({
            type: 'line',
            x: 0,
            y: 0,
            length: 1000,
            width: 100,
            rotation: 45,
        });
        expect(regionShapeData({ kind: 'rectangle', width: 4, height: 2 }, { x: 1, y: 2 }, 0, PPU)).toMatchObject({
            width: 400,
            height: 200,
            anchorX: 0.5,
            anchorY: 0.5,
        });
    });
});

describe('areaRegionData', () => {
    it('blocks sight through a smokescreen and marks it as the system area', () => {
        const data = areaRegionData(spec(), PPU, { combatId: 'c1', round: 14 }, 'wh40k-rpg', 'level1');
        expect(data.restriction).toEqual({ enabled: true, type: 'sight', priority: 0 });
        expect(data.visibility).toBe(2);
        // Foundry refuses a sight-blocking Region that is not on exactly one level.
        expect(data.levels).toEqual(['level1']);
        expect(data.behaviors).toEqual([]);
        expect(data.flags).toEqual({ 'wh40k-rpg': { area: { source: 'smoke', expiry: { combatId: 'c1', round: 14 } } } });
    });

    it('carries the apply-condition behaviour only when a condition is chosen', () => {
        const data = areaRegionData(spec({ condition: 'blinded', blocksSight: false }), PPU, null, 'wh40k-rpg', null);
        expect(data.restriction).toMatchObject({ enabled: false });
        expect(data.levels).toEqual([]);
        expect(data.behaviors).toEqual([{ name: 'Blind Grenade', type: APPLY_CONDITION_BEHAVIOR, system: { condition: 'blinded' } }]);
    });
});

describe('areaExpiry / areaExpired', () => {
    const combat = { id: 'c1', round: 3 };

    it('expires a timed area its duration in rounds after it was placed', () => {
        const expiry = areaExpiry(12, combat);
        expect(expiry).toEqual({ combatId: 'c1', round: 15 });
        expect(areaExpired(expiry, { id: 'c1', round: 14 })).toBe(false);
        expect(areaExpired(expiry, { id: 'c1', round: 15 })).toBe(true);
    });

    it('never expires without a combat, a duration, or in another combat', () => {
        expect(areaExpiry(12, null)).toBeNull();
        expect(areaExpiry(null, combat)).toBeNull();
        expect(areaExpiry(0, combat)).toBeNull();
        expect(areaExpired(null, combat)).toBe(false);
        expect(areaExpired({ combatId: 'c1', round: 2 }, { id: 'c2', round: 9 })).toBe(false);
    });
});

describe('areaOutline', () => {
    it('draws a circle around its centre at its radius', () => {
        const points = areaOutline({ kind: 'circle', radius: 1 }, { x: 0, y: 0 }, 0, PPU);
        for (const p of points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100);
    });

    it('opens a cone from its apex symmetrically about its bearing', () => {
        const points = areaOutline({ kind: 'cone', length: 1, angle: 90 }, { x: 0, y: 0 }, 0, PPU);
        expect(points[0]).toEqual({ x: 0, y: 0 });
        const first = points[1];
        const last = points.at(-1);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has it off, tsconfig.json (which includes this file) needs the guard
        expect(first?.x).toBeCloseTo(70.71);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has it off, tsconfig.json (which includes this file) needs the guard
        expect(first?.y).toBeCloseTo(-70.71);
        expect(last?.y).toBeCloseTo(70.71);
    });

    it('lays a line out along its bearing at its width', () => {
        const [a, b] = areaOutline({ kind: 'line', length: 2, width: 1 }, { x: 0, y: 0 }, 0, PPU);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has it off, tsconfig.json (which includes this file) needs the guard
        expect(a?.y).toBeCloseTo(-50);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has it off, tsconfig.json (which includes this file) needs the guard
        expect(b?.x).toBeCloseTo(200);
    });
});

describe('shapeIsAimed / bearingBetween', () => {
    it('aims a cone and a line, places a circle and a rectangle', () => {
        expect(shapeIsAimed({ kind: 'cone', length: 1, angle: 30 })).toBe(true);
        expect(shapeIsAimed({ kind: 'line', length: 1, width: 1 })).toBe(true);
        expect(shapeIsAimed({ kind: 'circle', radius: 1 })).toBe(false);
    });

    it('measures bearings clockwise from +x', () => {
        expect(bearingBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
        expect(bearingBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
        expect(bearingBetween({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
        expect(bearingBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });
});

describe('areaShapeFromInputs (the quick-template form)', () => {
    it('takes a circle as its diameter, so a 4 m smokescreen is a 2 m radius', () => {
        expect(areaShapeFromInputs('circle', 4, 0)).toEqual({ kind: 'circle', radius: 2 });
    });

    it('builds a cone, a line and a rectangle from their two sizes', () => {
        expect(areaShapeFromInputs('cone', 10, 30)).toEqual({ kind: 'cone', length: 10, angle: 30 });
        expect(areaShapeFromInputs('line', 10, 1)).toEqual({ kind: 'line', length: 10, width: 1 });
        expect(areaShapeFromInputs('rectangle', 4, 2)).toEqual({ kind: 'rectangle', width: 4, height: 2 });
    });

    it('refuses a size that is not a positive number, and a full-circle cone', () => {
        expect(areaShapeFromInputs('circle', 0, 0)).toBeNull();
        expect(areaShapeFromInputs('cone', 10, 0)).toBeNull();
        expect(areaShapeFromInputs('cone', 10, 360)).toBeNull();
        expect(areaShapeFromInputs('line', Number.NaN, 1)).toBeNull();
    });

    it('recognises the shape kinds', () => {
        expect(isAreaShapeKind('cone')).toBe(true);
        expect(isAreaShapeKind('hexagon')).toBe(false);
    });
});
