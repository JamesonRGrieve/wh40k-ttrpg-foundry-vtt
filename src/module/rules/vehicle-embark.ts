/**
 * @file Embarking and disembarking a vehicle (#508) — the document side.
 *
 * The decisions live in `vehicle-occupancy.ts` (pure); this module performs the
 * writes and the canvas plumbing they imply, and decides nothing of its own.
 *
 * Two operator decisions shape it:
 *
 * - **Occupancy is stored on the passenger** — a flag on the character pointing
 *   at the vehicle, so a deleted or unlinked vehicle token cannot leave a
 *   dangling occupant behind.
 * - **Occupant tokens are SLAVED to the vehicle**, not hidden: they stay visible
 *   and move with it, so "firing from a moving vehicle" reads correctly on the
 *   canvas.
 */

import { SYSTEM_ID } from '../constants.ts';
import { isVehicleActor, type VehicleActorLike } from '../vehicle/vehicle-interior.ts';
import {
    ABOARD_FLAG,
    canEmbark,
    capacityOf,
    defaultRole,
    movementDelta,
    type OccupantLike,
    occupantsOf,
    readAboard,
    slavedPosition,
    type VehicleRole,
} from './vehicle-occupancy.ts';

/**
 * The actor surface the embark writes need.
 *
 * `uuid` and `name` are nullable because Foundry types them that way on an
 * unsaved document; an actor with no uuid simply cannot be recorded as aboard.
 */
interface EmbarkableActor extends OccupantLike {
    readonly uuid: string | null;
    readonly name: string | null;
    /* eslint-disable no-restricted-syntax -- boundary: Foundry `Document#setFlag`/`unsetFlag` take an untyped scoped value and resolve to the opaque updated document */
    setFlag: (scope: string, key: string, value: unknown) => Promise<unknown>;
    unsetFlag: (scope: string, key: string) => Promise<unknown>;
    /* eslint-enable no-restricted-syntax */
}

/**
 * The vehicle surface the capacity check needs.
 *
 * Extends `VehicleActorLike` rather than `OccupantLike` so `isVehicleActor` — the
 * one type discriminator, shared with the interior link — accepts it directly
 * instead of needing a second shape.
 */
interface VehicleActorish extends VehicleActorLike {
    readonly uuid: string | null;
    readonly name: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: a DataModel's system payload is open-ended at this call site
    readonly system?: Record<string, unknown> | undefined;
}

/**
 * Put a character aboard a vehicle.
 *
 * Capacity is enforced before anything is written, and the refusal names the
 * specific reason (no driver seat, bay full, not a vehicle) rather than a
 * generic failure — a GM who cannot embark someone needs to know which.
 * @param {EmbarkableActor} actor  The character embarking.
 * @param {VehicleActorish} vehicle  The vehicle.
 * @param {VehicleRole} [role]  Seat to take; defaults to the first free one.
 * @returns {Promise<boolean>}  True when the character is now aboard.
 */
export async function embark(actor: EmbarkableActor, vehicle: VehicleActorish, role?: VehicleRole): Promise<boolean> {
    if (!isVehicleActor(vehicle) || vehicle.uuid === null) {
        ui.notifications.warn(game.i18n.format('WH40K.Vehicle.NotAVehicle', { name: vehicle.name ?? '' }));
        return false;
    }

    const capacity = capacityOf(vehicle.system);
    const occupants = occupantsOf(vehicle.uuid, game.actors);
    const seat = role ?? defaultRole(occupants, capacity);
    if (seat === null) {
        ui.notifications.warn(game.i18n.format('WH40K.Vehicle.Full', { name: vehicle.name ?? '' }));
        return false;
    }

    const verdict = canEmbark(occupants, capacity, seat);
    if (!verdict.allowed) {
        ui.notifications.warn(verdict.reason ?? game.i18n.format('WH40K.Vehicle.Full', { name: vehicle.name ?? '' }));
        return false;
    }

    await actor.setFlag(SYSTEM_ID, ABOARD_FLAG, { vehicleUuid: vehicle.uuid, role: seat });
    ui.notifications.info(game.i18n.format('WH40K.Vehicle.Embarked', { actor: actor.name ?? '', vehicle: vehicle.name ?? '', role: seat }));
    return true;
}

/**
 * Take a character off whatever it is aboard.
 *
 * The token is left exactly where it is — slaved movement has already kept it
 * with the vehicle, so it is already at the disembark point.
 * @param {EmbarkableActor} actor  The character.
 * @returns {Promise<boolean>}  True when it was aboard and is no longer.
 */
export async function disembark(actor: EmbarkableActor): Promise<boolean> {
    if (readAboard(actor) === null) return false;
    await actor.unsetFlag(SYSTEM_ID, ABOARD_FLAG);
    ui.notifications.info(game.i18n.format('WH40K.Vehicle.Disembarked', { actor: actor.name ?? '' }));
    return true;
}

/** The token surface the slaving update reads and writes. */
interface SlavableToken {
    readonly id: string | null;
    readonly x: number;
    readonly y: number;
    /** The token's actor. Typed as the vehicle shape because the guard tests it. */
    readonly actor?: (OccupantLike & VehicleActorLike & { uuid?: string | null | undefined }) | null | undefined;
}

/** The scene surface the slaving update walks. */
interface SlavingScene {
    readonly tokens: Iterable<SlavableToken>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `updateEmbeddedDocuments` resolves to an opaque document array
    updateEmbeddedDocuments: (name: string, updates: object[]) => Promise<unknown>;
}

/**
 * Move every occupant's token by the same delta the vehicle's token moved.
 *
 * Registered on `preUpdateToken`, where the document still holds the OLD
 * position and `changes` holds the new one — which is exactly the pair
 * `movementDelta` takes. The post-update hook would have to reconstruct the old
 * position from the delta it is trying to compute.
 *
 * Returns early unless the vehicle actually changed position: an unrelated
 * update (a rename, a flag write) must not issue a position update for every
 * occupant, and must not fight a concurrent manual move. No recursion risk —
 * occupants are characters, and only vehicles reach past the guard.
 * @param {SlavableToken} vehicleToken  The token being moved (pre-update).
 * @param {{x?: number, y?: number}} changes  The update payload.
 * @param {SlavingScene | null | undefined} scene  The scene the token is on.
 * @returns {Promise<number>}  How many occupant tokens were moved.
 */
export async function slaveOccupantTokens(
    vehicleToken: SlavableToken,
    changes: { x?: number | undefined; y?: number | undefined },
    scene: SlavingScene | null | undefined,
): Promise<number> {
    const vehicle = vehicleToken.actor;
    if (scene == null || !isVehicleActor(vehicle)) return 0;

    const delta = movementDelta({ x: vehicleToken.x, y: vehicleToken.y }, changes);
    if (delta === null) return 0;

    const vehicleUuid = readUuid(vehicle);
    if (vehicleUuid === null) return 0;

    const updates: { _id: string; x: number; y: number }[] = [];
    for (const token of scene.tokens) {
        if (token.id === null || token.id === vehicleToken.id) continue;
        const aboard = readAboard(token.actor);
        if (aboard?.vehicleUuid !== vehicleUuid) continue;
        updates.push({ _id: token.id, ...slavedPosition({ x: token.x, y: token.y }, delta) });
    }
    if (updates.length === 0) return 0;

    await scene.updateEmbeddedDocuments('Token', updates);
    return updates.length;
}

/**
 * A token's actor uuid. An unlinked token copy carries its own uuid, so
 * occupancy recorded against the placed vehicle still resolves.
 */
function readUuid(actor: (OccupantLike & { uuid?: string | null | undefined }) | null | undefined): string | null {
    const uuid = actor?.uuid;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}
