/**
 * @file Areas on the canvas as V14 Regions (#758): create them, expire them, and the
 * scene-control button that opens the quick-template tool.
 *
 * The system builds every area Region itself (`rules/area-region.ts` holds the pure
 * shape and data), so no one fills in Foundry's Region form by hand. V14 lets any player
 * create a Region but only a GM create one that carries behaviours, so an area with a
 * condition a player places is created by the active GM over the system socket.
 */
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { type AreaRegionData, type AreaRegionFlag, type AreaRegionSpec, areaExpired, areaExpiry, areaRegionData } from '../rules/area-region.ts';
import { hooksOn } from '../utils/hooks-on.ts';
import { emitSystemSocket, onSystemSocket, type SystemSocketMessage } from '../utils/system-socket.ts';

/** Where an area Region lives. */
export interface AreaRegionRef {
    sceneId: string;
    regionId: string;
}

/** A player's request that the active GM create an area Region. */
interface CreateAreaMessage extends SystemSocketMessage {
    type: 'createAreaRegion';
    requestId: string;
    sceneId: string;
    data: AreaRegionData;
}

/** The GM's answer to a {@link CreateAreaMessage}. */
interface AreaCreatedMessage extends SystemSocketMessage {
    type: 'areaRegionCreated';
    requestId: string;
    regionId: string | null;
}

/** How long a player waits for the GM to create a relayed area. */
const RELAY_TIMEOUT_MS = 10_000;

/** Requests a player has relayed, waiting for the GM's answer. */
const pendingRelays = new Map<string, (regionId: string | null) => void>();

/** Canvas pixels per scene unit (metre) on the active scene, or null without a canvas. */
export function pixelsPerUnit(): number | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `canvas.dimensions` is null until a scene is drawn
    const perUnit = canvas.dimensions?.distancePixels;
    return perUnit === undefined || perUnit <= 0 ? null : perUnit;
}

/** The current combat's clock, or null outside combat. */
function combatClock(): { id: string; round: number } | null {
    const combat = game.combat;
    return combat === null ? null : { id: combat.id, round: combat.round };
}

/** The system area flag a Region carries, or null for a Region the system didn't place. */
export function areaFlagOf(region: { flags: object }): AreaRegionFlag | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; the system flag is the AreaRegionFlag this module writes
    const flag = foundry.utils.getProperty(region.flags, `${SYSTEM_ID}.area`) as AreaRegionFlag | undefined;
    return flag ?? null;
}

/**
 * Create an area as a Region on the active scene. It lasts `durationRounds` rounds of
 * the current combat (none, or outside combat: until removed). Null, after a warning,
 * without a scene or when the GM couldn't be reached for an area that needs one.
 */
export async function createAreaRegion(spec: AreaRegionSpec, durationRounds: number | null): Promise<AreaRegionRef | null> {
    const scene = canvas.scene;
    const ppu = pixelsPerUnit();
    if (scene === null || ppu === null) {
        ui.notifications.warn(t('WH40K.AreaAttack.NoCanvas'));
        return null;
    }
    const data = areaRegionData(spec, ppu, areaExpiry(durationRounds, combatClock()), SYSTEM_ID, viewedLevelId());
    const needsGM = spec.condition !== '' && !game.user.isGM;
    const regionId = needsGM ? await relayToGM(scene.id, data) : await createOn(scene, data);
    if (regionId === null) {
        if (needsGM) ui.notifications.warn(t('WH40K.Area.NoGM'));
        return null;
    }
    return { sceneId: scene.id, regionId };
}

/**
 * The id of the scene level on view, or else the scene's first level; null on a scene
 * without levels. A V14 Region that blocks sight must sit on exactly one level, or
 * the server refuses it without a word.
 */
function viewedLevelId(): string | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; canvas.level and Scene#initialLevel (V14) are absent from fvtt-types
    const viewed: unknown = foundry.utils.getProperty(canvas, 'level.id') ?? foundry.utils.getProperty(canvas.scene ?? {}, 'initialLevel.id');
    return typeof viewed === 'string' ? viewed : null;
}

/** Create the Region on a scene and return its id. */
async function createOn(scene: Scene.Implementation, data: AreaRegionData): Promise<string | null> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Scene.createEmbeddedDocuments('Region') takes Foundry's untyped create data; areaRegionData builds it
    const created = await scene.createEmbeddedDocuments('Region', [data as never]);
    const id = created.at(0)?.id ?? null;
    // Foundry refuses a create silently (a permission or a pre-create veto): say so.
    if (id === null) ui.notifications.warn(t('WH40K.Area.CreateFailed'));
    return id;
}

/** Ask the active GM to create the Region and wait for the answer. */
async function relayToGM(sceneId: string, data: AreaRegionData): Promise<string | null> {
    if (game.users.activeGM === null) return null;
    const requestId = foundry.utils.randomID();
    const answer = new Promise<string | null>((resolve) => {
        pendingRelays.set(requestId, resolve);
        setTimeout(() => {
            if (pendingRelays.delete(requestId)) resolve(null);
        }, RELAY_TIMEOUT_MS);
    });
    const message: CreateAreaMessage = { type: 'createAreaRegion', requestId, sceneId, data };
    emitSystemSocket(message);
    return answer;
}

function isCreateAreaMessage(message: SystemSocketMessage): message is CreateAreaMessage {
    return message.type === 'createAreaRegion';
}

function isAreaCreatedMessage(message: SystemSocketMessage): message is AreaCreatedMessage {
    return message.type === 'areaRegionCreated';
}

/** Listen for relayed area requests (as the active GM) and their answers (as the asker). */
export function registerAreaRegionSocket(): void {
    onSystemSocket((message) => {
        if (isAreaCreatedMessage(message)) {
            const resolve = pendingRelays.get(message.requestId);
            if (resolve === undefined) return;
            pendingRelays.delete(message.requestId);
            resolve(message.regionId);
            return;
        }
        if (!isCreateAreaMessage(message) || game.users.activeGM?.isSelf !== true) return;
        const scene = game.scenes.get(message.sceneId);
        void (scene === undefined ? Promise.resolve(null) : createOn(scene, message.data)).then((regionId) => {
            const answer: AreaCreatedMessage = { type: 'areaRegionCreated', requestId: message.requestId, regionId };
            emitSystemSocket(answer);
        });
    });
}

/** Delete, on every scene, the system areas `isGone` picks. */
async function deleteAreas(isGone: (flag: AreaRegionFlag) => boolean): Promise<void> {
    for (const scene of game.scenes) {
        const ids = scene.regions
            .filter((region) => {
                const flag = areaFlagOf(region);
                return flag !== null && isGone(flag);
            })
            .map((region) => region.id);
        // eslint-disable-next-line no-await-in-loop -- sequential: one deletion per scene
        if (ids.length > 0) await scene.deleteEmbeddedDocuments('Region', ids);
    }
}

/** Remove every system area on the active scene (the quick-template tool's Clear). */
export async function clearSceneAreas(): Promise<void> {
    const scene = canvas.scene;
    if (scene === null) return;
    const ids = scene.regions.filter((region) => areaFlagOf(region) !== null && region.isOwner).map((region) => region.id);
    if (ids.length > 0) await scene.deleteEmbeddedDocuments('Region', ids);
}

/**
 * Expire timed areas as their combat's rounds pass, and drop a combat's timed areas when
 * it ends; add the quick-template button to the WH40K scene-control group. The button
 * opens the dialog the caller passes, so this module doesn't import the dialog (which
 * imports it: an import cycle).
 */
export function registerAreaRegions(openQuickTemplate: () => void): void {
    hooksOn('updateCombat', (combat: Combat, changed: { round?: number }) => {
        if (changed.round === undefined || game.users.activeGM?.isSelf !== true || combat.id === null) return;
        const clock = { id: combat.id, round: combat.round };
        void deleteAreas((flag) => areaExpired(flag.expiry, clock));
    });
    hooksOn('deleteCombat', (combat: Combat) => {
        if (game.users.activeGM?.isSelf !== true) return;
        void deleteAreas((flag) => flag.expiry !== null && flag.expiry.combatId === combat.id);
    });
    hooksOn('getSceneControlButtons', (controls: Record<string, foundry.applications.ui.SceneControls.Control>) => {
        if (!('wh40k' in controls)) return;
        const group = controls['wh40k'];
        group.tools['quickTemplate'] = {
            name: 'quickTemplate',
            title: 'WH40K.Area.QuickTemplate.Title',
            icon: 'fa-solid fa-draw-polygon',
            visible: true,
            onChange: openQuickTemplate,
            button: true,
            order: Object.keys(group.tools).length,
        };
    });
}

/** An area Region's geometry in canvas pixels, as attack resolution and cues read it. */
export interface AreaGeometry {
    shape: 'cone' | 'circle';
    origin: { x: number; y: number };
    /** Cone length or circle radius, in pixels. */
    reach: number;
    /** Bearing in degrees (0 = +x, clockwise). */
    direction: number;
    /** Cone opening in degrees; 0 for a circle. */
    angle: number;
}

/** The first shape of a Region, as Foundry stores it. */
interface StoredShape {
    type: string;
    x: number;
    y: number;
    radius?: number;
    angle?: number;
    rotation?: number;
}

/** The geometry of an area Region on the viewed scene, or null when it is gone or not a cone or circle. */
export function areaGeometry(sceneId: string, regionId: string): AreaGeometry | null {
    const scene = canvas.scene;
    if (scene?.id !== sceneId) return null;
    const region = scene.regions.get(regionId);
    // eslint-disable-next-line no-restricted-syntax -- boundary: RegionDocument.shapes holds Foundry's shape data union; the area shapes the system writes are circles and cones
    const shape = region?.shapes.at(0) as StoredShape | undefined;
    if (shape === undefined || (shape.type !== 'cone' && shape.type !== 'circle')) return null;
    return {
        shape: shape.type,
        origin: { x: shape.x, y: shape.y },
        reach: shape.radius ?? 0,
        direction: shape.rotation ?? 0,
        angle: shape.type === 'cone' ? shape.angle ?? 0 : 0,
    };
}
