import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CelestialBodies } from '../rules/scene-lighting.ts';
import type { SunPosition } from '../rules/sun-position.ts';
import { HOUR_SECONDS } from '../rules/world-time.ts';
import { sceneSunUpdate, type SunScene, syncSceneSuns } from './zephyr-cartography.ts';

/**
 * Unit coverage for the Zephyr Cartography sun sync: feature detection of the
 * optional module, the per-scene plan, and the write-only-on-change rule, with a
 * stubbed `game.modules` — no licensed Foundry or installed module required.
 */

const BODIES: CelestialBodies = {
    terra: { name: 'Terra', rotationHours: 24, weather: 'clear' },
};

const NOON = 12 * HOUR_SECONDS;

function sunScene(id: string | null, body: string | undefined, latitude: number | undefined, stored?: SunPosition): SunScene {
    return {
        id,
        getFlag: (scope, key) => {
            if (scope === 'zephyr-cartography') return key === 'sun' ? stored : undefined;
            return key === 'celestialBody' ? body : key === 'latitude' ? latitude : undefined;
        },
    };
}

interface ModuleStub {
    active: boolean;
    api?: { setSun?: (sun: SunPosition, sceneId: string) => Promise<boolean> };
}

function stubModules(module: ModuleStub | undefined): void {
    vi.stubGlobal('game', { modules: { get: (id: string) => (id === 'zephyr-cartography' ? module : undefined) } });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('sceneSunUpdate', () => {
    it('stands a bound scene with a latitude under its body’s sun', () => {
        expect(sceneSunUpdate(sunScene('a', 'terra', 45), BODIES, NOON)).toEqual({ azimuth: 180, elevation: 45 });
    });

    it('is null when the stored sun is already within a degree', () => {
        expect(sceneSunUpdate(sunScene('a', 'terra', 45, { azimuth: 180, elevation: 45.4 }), BODIES, NOON)).toBeNull();
    });

    it('is null for an unbound scene, an unknown body, or no latitude', () => {
        expect(sceneSunUpdate(sunScene('a', undefined, 45), BODIES, NOON)).toBeNull();
        expect(sceneSunUpdate(sunScene('a', 'nowhere', 45), BODIES, NOON)).toBeNull();
        expect(sceneSunUpdate(sunScene('a', 'terra', undefined), BODIES, NOON)).toBeNull();
    });
});

describe('syncSceneSuns', () => {
    it('sets the sun of every scene that needs it through the module’s API', async () => {
        const setSun = vi.fn(async (_sun: SunPosition, _sceneId: string) => Promise.resolve(true));
        stubModules({ active: true, api: { setSun } });
        const scenes = [
            sunScene('a', 'terra', 45),
            sunScene('b', 'terra', 45, { azimuth: 180, elevation: 45 }),
            sunScene(null, 'terra', 45),
            sunScene('c', undefined, 45),
        ];
        await syncSceneSuns(scenes, BODIES, NOON);
        expect(setSun.mock.calls).toEqual([[{ azimuth: 180, elevation: 45 }, 'a']]);
    });

    const setSunNever = vi.fn(async (_sun: SunPosition, _sceneId: string) => Promise.resolve(true));
    it.each<[string, ModuleStub | undefined]>([
        ['absent', undefined],
        ['inactive', { active: false, api: { setSun: setSunNever } }],
        ['without a sun API', { active: true, api: {} }],
        ['without an API', { active: true }],
    ])('does nothing when the module is %s', async (_case, module) => {
        stubModules(module);
        await syncSceneSuns([sunScene('a', 'terra', 45)], BODIES, NOON);
        expect(setSunNever).not.toHaveBeenCalled();
    });
});
