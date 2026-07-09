/**
 * Vehicle ↔ interior-Scene link (dual-nature vehicles).
 *
 * A vehicle is both a combat **Actor** and a walkable-interior **Location**: its
 * interior is a Foundry Scene where crew and passengers are placed as tokens. The
 * kanka-foundry importer emits the Actor and the Scene from a single authored
 * vehicle and cross-links them by a flag; this module is the in-game consumer —
 * it resolves the linked Scene off the actor and surfaces a header control to
 * board (open) it.
 *
 * The link is a flag under the importer's own scope (`kanka-foundry`), mirroring
 * how the importer stamps `kankaEntityId` etc. on the documents it creates. The
 * system only *reads* it, so a GM who hand-builds an interior Scene can wire it up
 * by setting the same flag.
 */

import { t } from '../i18n/t.ts';

/** Flag scope the kanka-foundry importer owns and stamps its cross-links under. */
export const KANKA_FOUNDRY_SCOPE = 'kanka-foundry';

/** Flag key holding the linked interior Scene id on a vehicle actor. */
export const INTERIOR_SCENE_FLAG = 'interiorSceneId';

/** Actor `type` suffixes that denote a vehicle (per-system `<id>-<kind>`). */
const VEHICLE_TYPE_SUFFIXES = ['terracraft', 'aircraft', 'watercraft', 'voidcraft', 'vehicle'] as const;

/** Minimal actor surface this module reads — kept structural so it unit-tests without Foundry. */
export interface VehicleActorLike {
    readonly type: string;
    /**
     * Raw flags bag. Read directly — NOT via `actor.getFlag(scope, key)`: Foundry
     * V14's `getFlag` throws `Flag scope "…" is not valid or not currently active`
     * when the scope's module (kanka-foundry) isn't active, which would crash every
     * vehicle sheet render in any world without the importer installed.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry flags bag holds untyped module-scoped data
    readonly flags?: Record<string, Record<string, unknown> | undefined>;
}

/** Minimal Scene surface: a viewable/activatable Foundry Scene. */
export interface InteriorSceneLike {
    readonly id: string;
    readonly name: string;
    view: () => Promise<void>;
}

/** Minimal scene-collection surface (structurally satisfied by `game.scenes`). */
export type SceneLookup = { get: (id: string) => InteriorSceneLike | undefined };

/** True when the actor is any per-system vehicle/craft type. */
export function isVehicleActor(actor: VehicleActorLike | null | undefined): boolean {
    if (actor === null || actor === undefined) return false;
    return VEHICLE_TYPE_SUFFIXES.some((suffix) => actor.type.endsWith(`-${suffix}`) || actor.type === suffix);
}

/** The linked interior Scene id stamped on the vehicle, or null when none. */
export function getInteriorSceneId(actor: VehicleActorLike | null | undefined): string | null {
    if (!isVehicleActor(actor)) return null;
    // Read the raw flags bag rather than actor.getFlag(scope, key): V14's getFlag
    // throws when the kanka-foundry module isn't active (see VehicleActorLike.flags).
    const raw = actor?.flags?.[KANKA_FOUNDRY_SCOPE]?.[INTERIOR_SCENE_FLAG];
    return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** Resolve the linked interior Scene from a scene collection, or null. */
export function resolveInteriorScene(actor: VehicleActorLike | null | undefined, scenes: SceneLookup | null | undefined): InteriorSceneLike | null {
    const id = getInteriorSceneId(actor);
    if (id === null || scenes === null || scenes === undefined) return null;
    return scenes.get(id) ?? null;
}

/** Whether a "board interior" affordance should be offered for this actor. */
export function hasInteriorScene(actor: VehicleActorLike | null | undefined, scenes: SceneLookup | null | undefined): boolean {
    return resolveInteriorScene(actor, scenes) !== null;
}

/** A vehicle-sheet header control entry. */
export interface VehicleHeaderControl {
    icon: string;
    label: string;
    action: string;
    visible: boolean;
}

/**
 * The header-control entries a vehicle actor sheet should append. Empty for a
 * non-vehicle or a vehicle with no linked interior Scene, so a plain call site
 * (`...vehicleInteriorHeaderControls(actor, scenes)`) is a safe no-op elsewhere.
 */
export function vehicleInteriorHeaderControls(actor: VehicleActorLike | null | undefined, scenes: SceneLookup | null | undefined): VehicleHeaderControl[] {
    if (!hasInteriorScene(actor, scenes)) return [];
    return [
        {
            icon: 'fa-solid fa-door-open',
            label: t('WH40K.Vehicle.OpenInterior'),
            action: 'openVehicleInterior',
            visible: true,
        },
    ];
}

/**
 * Open (view) the vehicle's linked interior Scene. No-op with a notification when
 * the link is missing/broken. Returns true when a Scene was viewed.
 */
export async function openInteriorScene(actor: VehicleActorLike | null | undefined, scenes: SceneLookup | null | undefined): Promise<boolean> {
    const scene = resolveInteriorScene(actor, scenes);
    if (scene === null) {
        ui.notifications.warn(t('WH40K.Vehicle.NoInterior'));
        return false;
    }
    await scene.view();
    return true;
}
