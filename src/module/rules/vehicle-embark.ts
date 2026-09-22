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
    droppedOnto,
    movementDelta,
    type OccupantLike,
    occupantSortBelowVehicle,
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
    const occupants = occupantsOf(vehicle.uuid, occupantCandidateActors());
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
 * Every actor that could be recorded aboard a vehicle: the world's actors PLUS
 * the actors of tokens placed on the current canvas.
 *
 * Occupancy is a flag on the passenger (see {@link occupantsOf}), and #479 makes
 * every placed token an UNLINKED actor copy — whose synthetic actor is NOT in
 * `game.actors`. Scanning only the world collection therefore misses the common
 * case: a character embarked via its canvas token never appears in the crew
 * roster. Deduped by identity so a linked token (whose `.actor` IS its world
 * actor) is not scanned twice.
 * @returns {OccupantLike[]}  Candidate occupant actors, world ∪ canvas, deduped.
 */
export function occupantCandidateActors(): Actor.Implementation[] {
    const out: Actor.Implementation[] = [];
    const seen = new Set<Actor.Implementation>();
    const add = (actor: Actor.Implementation | null | undefined): void => {
        if (actor == null || seen.has(actor)) return;
        seen.add(actor);
        out.push(actor);
    };
    for (const actor of game.actors) add(actor);
    // eslint-disable-next-line no-restricted-syntax -- boundary: `canvas.tokens.placeables` is Foundry's untyped placeable array; each placeable's `.actor` is its synthetic (unlinked) or world actor
    const placeables =
        (canvas as { tokens?: { placeables?: ReadonlyArray<{ actor?: Actor.Implementation | null | undefined }> } | undefined }).tokens?.placeables ?? [];
    for (const token of placeables) add(token.actor);
    return out;
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

/** A token document's stacking slice: its `sort` and the update to change it. */
export interface TokenSortDoc {
    readonly sort?: number | null | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `TokenDocument#update` takes a free-form data bag and resolves to the opaque updated document
    update?: ((data: object) => Promise<unknown>) | undefined;
}

/**
 * Sink an occupant's token just below the vehicle it boarded, so the vehicle
 * renders on top of the passengers riding inside it. No-op when the token is
 * already below the vehicle or cannot be updated.
 * @param {TokenSortDoc | null | undefined} occupant  The occupant token document.
 * @param {TokenSortDoc | null | undefined} vehicle  The vehicle token document.
 * @returns {Promise<void>}
 */
export async function sinkOccupantBelowVehicle(occupant: TokenSortDoc | null | undefined, vehicle: TokenSortDoc | null | undefined): Promise<void> {
    if (occupant?.update === undefined || vehicle == null) return;
    const newSort = occupantSortBelowVehicle(vehicle.sort ?? 0, occupant.sort ?? 0);
    if (newSort === null) return;
    await occupant.update({ sort: newSort });
}

/** The token surface the slaving and drop-detection paths read. */
interface SlavableToken extends TokenSortDoc {
    readonly id: string | null;
    readonly x: number;
    readonly y: number;
    /** Footprint in scene pixels, for the drop-onto test. */
    readonly width: number;
    readonly height: number;
    /**
     * The token's actor. Typed as BOTH shapes: the same token may be the vehicle
     * being moved (slaving) or the character being dropped onto one (embark), and
     * the guards discriminate at runtime — so neither path needs a cast.
     */
    readonly actor?: (EmbarkableActor & VehicleActorish) | null | undefined;
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
 * Embark a character whose move landed it on top of a vehicle (#508).
 *
 * The second gesture the issue asks for, alongside the token-HUD control.
 * Deliberately conservative about what counts as intent:
 *
 * - The **mover's centre** must land inside the vehicle's footprint. Any-overlap
 *   would embark a character who merely clipped a Chimera's corner while running
 *   past.
 * - It never moves a character between vehicles. Someone already aboard has to
 *   disembark first, so a mis-drop cannot silently reseat the driver.
 * - It never embarks a vehicle into a vehicle.
 *
 * Runs on the same `preUpdateToken` pass as the slaving, which is why the slaved
 * occupants of a moving vehicle do not trigger it: their move is authored by us,
 * and their centres land on the vehicle they are already aboard.
 * @param {SlavableToken} moverToken  The token being moved (pre-update).
 * @param {{x?: number, y?: number}} changes  The update payload.
 * @param {SlavingScene | null | undefined} scene  The scene the token is on.
 * @returns {Promise<boolean>}  True when the mover was embarked.
 */
export async function embarkOnDropOnto(
    moverToken: SlavableToken,
    changes: { x?: number | undefined; y?: number | undefined },
    scene: SlavingScene | null | undefined,
): Promise<boolean> {
    const mover = moverToken.actor;
    if (scene == null || mover == null) return false;
    // A vehicle does not board another vehicle, and someone already aboard must
    // disembark deliberately rather than being reseated by a stray drag.
    if (isVehicleActor(mover) || readAboard(mover) !== null) return false;

    const delta = movementDelta({ x: moverToken.x, y: moverToken.y }, changes);
    if (delta === null) return false;

    const destination = {
        ...slavedPosition({ x: moverToken.x, y: moverToken.y }, delta),
        width: moverToken.width,
        height: moverToken.height,
    };

    // Find the (first) vehicle the mover was dropped onto, THEN act — so the
    // awaits stay out of the loop (a token is dropped onto one vehicle).
    let hit: { candidate: EmbarkableActor & VehicleActorish; vehicleToken: SlavableToken } | undefined;
    for (const token of scene.tokens) {
        if (token.id === moverToken.id) continue;
        const candidate = token.actor;
        if (candidate == null || !isVehicleActor(candidate)) continue;
        if (!droppedOnto(destination, { x: token.x, y: token.y, width: token.width, height: token.height })) continue;
        hit = { candidate, vehicleToken: token };
        break;
    }
    if (hit === undefined) return false;

    const boarded = await embark(mover, hit.candidate);
    // Sink the boarder below the vehicle so it rides underneath rather than on top.
    if (boarded) await sinkOccupantBelowVehicle(moverToken, hit.vehicleToken);
    return boarded;
}

/**
 * A token's actor uuid. An unlinked token copy carries its own uuid, so
 * occupancy recorded against the placed vehicle still resolves.
 */
function readUuid(actor: (OccupantLike & { uuid?: string | null | undefined }) | null | undefined): string | null {
    const uuid = actor?.uuid;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}
