/**
 * Tests for the vehicle ↔ interior-Scene link helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getInteriorSceneId,
    hasInteriorScene,
    INTERIOR_SCENE_FLAG,
    isVehicleActor,
    KANKA_FOUNDRY_SCOPE,
    openInteriorScene,
    resolveInteriorScene,
    vehicleInteriorHeaderControls,
    type InteriorSceneLike,
    type VehicleActorLike,
} from './vehicle-interior.ts';

/** Build a stub actor whose flag store returns `sceneId` for the interior link. */
function actor(type: string, sceneId?: string): VehicleActorLike {
    return {
        type,
        // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry Document.getFlag's unknown return
        getFlag: (scope: string, key: string): unknown => (scope === KANKA_FOUNDRY_SCOPE && key === INTERIOR_SCENE_FLAG ? sceneId : undefined),
    };
}

function sceneCollection(scene: InteriorSceneLike | null): { get: (id: string) => InteriorSceneLike | undefined } {
    return { get: (id: string) => (scene !== null && id === scene.id ? scene : undefined) };
}

beforeEach(() => {
    vi.stubGlobal('game', { i18n: { localize: (k: string) => k, format: (k: string) => k } });
    vi.stubGlobal('ui', { notifications: { warn: vi.fn(), info: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe('isVehicleActor', () => {
    it.each(['dh2-terracraft', 'rt-voidcraft', 'ow-aircraft', 'bc-watercraft', 'vehicle'])('is true for %s', (type) => {
        expect(isVehicleActor(actor(type))).toBe(true);
    });
    it.each(['dh2-character', 'dh2-npc', 'im-character'])('is false for %s', (type) => {
        expect(isVehicleActor(actor(type))).toBe(false);
    });
    it('is false for null/undefined', () => {
        expect(isVehicleActor(null)).toBe(false);
        expect(isVehicleActor(undefined)).toBe(false);
    });
});

describe('getInteriorSceneId', () => {
    it('returns the flagged scene id for a vehicle', () => {
        expect(getInteriorSceneId(actor('dh2-aircraft', 'scene-1'))).toBe('scene-1');
    });
    it('returns null for a non-vehicle even if the flag is set', () => {
        expect(getInteriorSceneId(actor('dh2-character', 'scene-1'))).toBeNull();
    });
    it('returns null when the flag is missing or empty', () => {
        expect(getInteriorSceneId(actor('dh2-aircraft'))).toBeNull();
        expect(getInteriorSceneId(actor('dh2-aircraft', ''))).toBeNull();
    });
});

describe('resolveInteriorScene / hasInteriorScene', () => {
    const scene: InteriorSceneLike = { id: 'scene-1', name: 'Main deck', view: vi.fn(async () => Promise.resolve()) };

    it('resolves the linked scene', () => {
        expect(resolveInteriorScene(actor('dh2-aircraft', 'scene-1'), sceneCollection(scene))).toBe(scene);
        expect(hasInteriorScene(actor('dh2-aircraft', 'scene-1'), sceneCollection(scene))).toBe(true);
    });
    it('returns null when the scene id resolves to nothing', () => {
        expect(resolveInteriorScene(actor('dh2-aircraft', 'missing'), sceneCollection(scene))).toBeNull();
        expect(hasInteriorScene(actor('dh2-aircraft', 'missing'), sceneCollection(scene))).toBe(false);
    });
    it('returns null with no scenes collection', () => {
        expect(resolveInteriorScene(actor('dh2-aircraft', 'scene-1'), null)).toBeNull();
    });
});

describe('vehicleInteriorHeaderControls', () => {
    const scene: InteriorSceneLike = { id: 'scene-1', name: 'Main deck', view: vi.fn(async () => Promise.resolve()) };

    it('emits one control for a linked vehicle', () => {
        const controls = vehicleInteriorHeaderControls(actor('dh2-aircraft', 'scene-1'), sceneCollection(scene));
        expect(controls).toHaveLength(1);
        expect(controls[0]?.action).toBe('openVehicleInterior');
    });
    it('emits nothing for a vehicle with no linked scene', () => {
        expect(vehicleInteriorHeaderControls(actor('dh2-aircraft'), sceneCollection(scene))).toEqual([]);
    });
    it('emits nothing for a non-vehicle', () => {
        expect(vehicleInteriorHeaderControls(actor('dh2-character', 'scene-1'), sceneCollection(scene))).toEqual([]);
    });
});

describe('openInteriorScene', () => {
    it('views the linked scene and returns true', async () => {
        const view = vi.fn(async () => Promise.resolve());
        const scene: InteriorSceneLike = { id: 'scene-1', name: 'Main deck', view };
        const result = await openInteriorScene(actor('dh2-aircraft', 'scene-1'), sceneCollection(scene));
        expect(result).toBe(true);
        expect(view).toHaveBeenCalledOnce();
    });
    it('warns and returns false when the link is broken', async () => {
        const scene: InteriorSceneLike = { id: 'scene-1', name: 'Main deck', view: vi.fn(async () => Promise.resolve()) };
        const result = await openInteriorScene(actor('dh2-aircraft', 'missing'), sceneCollection(scene));
        expect(result).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledOnce();
    });
});
