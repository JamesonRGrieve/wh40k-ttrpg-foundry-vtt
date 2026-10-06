import type { SYSTEM_ID } from '../constants.ts';
import { type BodyBoundScene, type CelestialBodies, sceneBodyKey, sceneLatitude } from '../rules/scene-lighting.ts';
import { bodySun, parseStoredSun, type SunPosition, sunChanged } from '../rules/sun-position.ts';

/**
 * Zephyr Cartography integration (#588 follow-up): the sun its drop shadows fall
 * from follows the scene's celestial body.
 *
 * A scene bound to a body and given a latitude has its cartography sun set from
 * the body's local hour, year and axial tilt (`rules/sun-position.ts`) whenever
 * the scene lighting re-syncs. The module is optional: absent or without the API,
 * nothing happens. The sun is written only when it moved a degree or more, read
 * back from the module's own scene flag, so a ticking clock never spams updates.
 */

/** The module's id, and the scene flag it keeps a scene's sun under (its `foundry/shadow-layer.ts` `SUN_FLAG`). */
const CARTOGRAPHY_MODULE_ID = 'zephyr-cartography';
const CARTOGRAPHY_SUN_FLAG = 'sun';

/** The one call this integration makes: stand a scene's sun (cartography `foundry/api.ts` `setSun`). */
interface CartographySunApi {
    setSun: (sun: SunPosition, sceneId: string) => Promise<boolean>;
}

/** The scene surface the sun sync reads: its id, the system's body and latitude flags, and the module's sun flag. */
export interface SunScene extends BodyBoundScene {
    readonly id: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry Document#getFlag, typed as returning unknown; narrowed by parseStoredSun
    getFlag: (scope: typeof SYSTEM_ID | typeof CARTOGRAPHY_MODULE_ID, key: string) => unknown;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a third-party module's `api` object is untyped in our type surface
function isSunApi(api: unknown): api is CartographySunApi {
    return typeof api === 'object' && api !== null && 'setSun' in api && typeof api.setSun === 'function';
}

/** The module's sun API when it is active, else null. */
function cartographySunApi(): CartographySunApi | null {
    const module = game.modules.get(CARTOGRAPHY_MODULE_ID);
    if (module?.active !== true || !('api' in module)) return null;
    return isSunApi(module.api) ? module.api : null;
}

/**
 * The sun a scene should stand under now, or null when it is not bound to a known
 * body, has no latitude, or its sun has not moved enough to be worth writing.
 * @param scene    The scene.
 * @param bodies   The configured bodies.
 * @param elapsed  Terran seconds since the world clock's inception.
 */
export function sceneSunUpdate(scene: SunScene, bodies: CelestialBodies, elapsed: number): SunPosition | null {
    const key = sceneBodyKey(scene);
    const body = key === null ? undefined : bodies[key];
    const latitude = sceneLatitude(scene);
    if (body === undefined || latitude === null) return null;
    const sun = bodySun(elapsed, body, latitude);
    return sunChanged(parseStoredSun(scene.getFlag(CARTOGRAPHY_MODULE_ID, CARTOGRAPHY_SUN_FLAG)), sun) ? sun : null;
}

/** Stand every bound scene's cartography sun where its body's sun is now. Run by one GM client only. */
export async function syncSceneSuns(scenes: Iterable<SunScene>, bodies: CelestialBodies, elapsed: number): Promise<void> {
    const api = cartographySunApi();
    if (api === null) return;
    const writes: Array<Promise<boolean>> = [];
    for (const scene of scenes) {
        const sun = sceneSunUpdate(scene, bodies, elapsed);
        if (sun !== null && scene.id !== null) writes.push(api.setSun(sun, scene.id));
    }
    await Promise.all(writes);
}
