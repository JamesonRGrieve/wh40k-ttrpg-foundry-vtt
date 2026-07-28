/**
 * @file Vehicle occupancy — who is aboard, and in what seat (#508).
 *
 * The system tracked vehicle CAPACITY (`crew.required`, `passengers`) but had
 * nowhere to record OCCUPANCY, so there was no way to put a character into a
 * vehicle and nothing for the dependent rules — the driver rolling Operate,
 * passengers sheltering behind the hull, occupants taking damage when it is
 * destroyed — to attribute themselves to.
 *
 * **Occupancy is stored on the PASSENGER** (operator's decision): a flag on the
 * character actor pointing at the vehicle. The alternative — a list of ids on the
 * vehicle — leaves a dangling reference whenever a token is deleted or an actor
 * unlinked, and #479 ("every placed token is an unlinked actor copy") makes that
 * the common case rather than the edge. The cost is that the vehicle must scan to
 * answer "who is aboard"; `occupantsOf` is that scan, and at party scale it is
 * cheaper than the reconciliation the other direction would need.
 *
 * This module is pure — no documents are read or written here — so capacity
 * enforcement and the seat rules are unit-testable without a world.
 */

import { SYSTEM_ID } from '../constants.ts';

/** Flag key on a character actor recording the vehicle it is aboard. */
export const ABOARD_FLAG = 'aboard';

/** Seats an occupant can fill. `driver` and `gunner` are crew, not passengers. */
const VEHICLE_ROLES = ['driver', 'gunner', 'crew', 'passenger'] as const;
export type VehicleRole = (typeof VEHICLE_ROLES)[number];

/** Roles that consume a crew slot rather than a passenger slot. */
const CREW_ROLES: ReadonlySet<string> = new Set<string>(['driver', 'gunner', 'crew']);

/** A vehicle may have at most one driver — two people cannot steer it. */
const UNIQUE_ROLES: ReadonlySet<string> = new Set<string>(['driver']);

/** What a character's `aboard` flag records. */
export interface AboardState {
    /** UUID of the vehicle actor the character is aboard. */
    vehicleUuid: string;
    role: VehicleRole;
}

/** The slice of an actor this module reads. */
export interface OccupantLike {
    /** Nullable because Foundry types an unsaved document's name that way. */
    readonly name?: string | null | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `actor.flags` is an untyped per-module flag bag; narrowed by `readAboard`
    readonly flags?: Record<string, Record<string, unknown> | undefined> | undefined;
}

/** True when the value is one of the declared seats. */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over an untyped Foundry document flag; the guard IS the validation
function isVehicleRole(value: unknown): value is VehicleRole {
    return typeof value === 'string' && (VEHICLE_ROLES as readonly string[]).includes(value);
}

/**
 * The `aboard` state on a character, or null.
 *
 * Validated rather than trusted: a hand-edited or half-written flag must read as
 * "not aboard" instead of producing an occupant with an undefined seat.
 * @param {OccupantLike} actor  The character.
 * @returns {AboardState | null}  Where it is aboard, or null.
 */
export function readAboard(actor: OccupantLike | null | undefined): AboardState | null {
    const raw = actor?.flags?.[SYSTEM_ID]?.[ABOARD_FLAG];
    if (raw === null || typeof raw !== 'object') return null;
    if (!('vehicleUuid' in raw) || !('role' in raw)) return null;
    const { vehicleUuid, role } = raw;
    if (typeof vehicleUuid !== 'string' || vehicleUuid === '' || !isVehicleRole(role)) return null;
    return { vehicleUuid, role };
}

/** One occupant and the seat they fill. */
export interface Occupant<T> {
    actor: T;
    role: VehicleRole;
}

/**
 * Everyone aboard a given vehicle — the scan the passenger-side model implies.
 *
 * Ordered by seat (driver, gunner, crew, passenger) so the crew tab reads as a
 * roster rather than in whatever order the actors happen to be collected.
 * @param {string} vehicleUuid  The vehicle's UUID.
 * @param {Iterable<T>} actors  The world's actors.
 * @returns {Occupant<T>[]}  Occupants, ordered by seat.
 */
export function occupantsOf<T extends OccupantLike>(vehicleUuid: string, actors: Iterable<T>): Occupant<T>[] {
    const found: Occupant<T>[] = [];
    for (const actor of actors) {
        const aboard = readAboard(actor);
        if (aboard !== null && aboard.vehicleUuid === vehicleUuid) found.push({ actor, role: aboard.role });
    }
    return found.sort((a, b) => VEHICLE_ROLES.indexOf(a.role) - VEHICLE_ROLES.indexOf(b.role));
}

/** A vehicle's seating, from its authored capacity fields. */
export interface VehicleCapacity {
    /** `system.crew.required` — driver + gunners + crew. */
    crew: number;
    /** `system.passengers`. */
    passengers: number;
}

/** Read capacity off a vehicle's system data, defaulting missing values to 0. */
// eslint-disable-next-line no-restricted-syntax -- boundary: reads a Foundry DataModel's system payload, which is open-ended at this call site
export function capacityOf(system: Record<string, unknown> | null | undefined): VehicleCapacity {
    const crewBlock = system?.['crew'];
    const required = crewBlock !== null && typeof crewBlock === 'object' && 'required' in crewBlock ? crewBlock.required : undefined;
    return { crew: seatCount(required), passengers: seatCount(system?.['passengers']) };
}

/** A capacity value as a whole non-negative seat count; anything else is 0. */
// eslint-disable-next-line no-restricted-syntax -- boundary: reads an open-ended DataModel system payload; the typeof check IS the validation
function seatCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Whether an embark may proceed, and why not. */
export interface EmbarkVerdict {
    allowed: boolean;
    reason?: string | undefined;
}

/**
 * Whether one more occupant fits in the given seat.
 *
 * Crew and passenger capacity are counted separately — a Chimera with a full
 * troop bay can still be missing its driver, and reporting "full" for that is
 * the wrong answer.
 * @param {Occupant<OccupantLike>[]} occupants  Who is already aboard.
 * @param {VehicleCapacity} capacity  The vehicle's seating.
 * @param {VehicleRole} role  The seat being taken.
 * @returns {EmbarkVerdict}  Whether it fits.
 */
export function canEmbark(occupants: readonly Occupant<OccupantLike>[], capacity: VehicleCapacity, role: VehicleRole): EmbarkVerdict {
    if (UNIQUE_ROLES.has(role) && occupants.some((o) => o.role === role)) {
        return { allowed: false, reason: `This vehicle already has a ${role}.` };
    }
    const isCrewSeat = CREW_ROLES.has(role);
    const taken = occupants.filter((o) => CREW_ROLES.has(o.role) === isCrewSeat).length;
    const limit = isCrewSeat ? capacity.crew : capacity.passengers;
    if (taken >= limit) {
        return { allowed: false, reason: isCrewSeat ? `Crew is full (${taken}/${limit}).` : `No passenger space (${taken}/${limit}).` };
    }
    return { allowed: true };
}

/**
 * Crew seats still unfilled, so the sheet can say what the vehicle is missing
 * rather than only whether it is full.
 * @param {Occupant<OccupantLike>[]} occupants  Who is aboard.
 * @param {VehicleCapacity} capacity  The vehicle's seating.
 * @returns {number}  Unfilled crew seats.
 */
export function unfilledCrew(occupants: readonly Occupant<OccupantLike>[], capacity: VehicleCapacity): number {
    return Math.max(0, capacity.crew - occupants.filter((o) => CREW_ROLES.has(o.role)).length);
}

/**
 * The seat a character should take by default when they embark.
 *
 * Driver first (a vehicle nobody is driving is the useless case), then the
 * remaining crew seats, then a passenger seat.
 * @param {Occupant<OccupantLike>[]} occupants  Who is aboard.
 * @param {VehicleCapacity} capacity  The vehicle's seating.
 * @returns {VehicleRole | null}  The seat, or null when the vehicle is full.
 */
export function defaultRole(occupants: readonly Occupant<OccupantLike>[], capacity: VehicleCapacity): VehicleRole | null {
    for (const role of VEHICLE_ROLES) {
        if (canEmbark(occupants, capacity, role).allowed) return role;
    }
    return null;
}

/**
 * Move a slaved token by the same delta the vehicle moved.
 *
 * Occupant tokens are slaved to the vehicle rather than hidden (operator's
 * decision), so they stay visible and "firing from a moving vehicle" reads
 * correctly on the canvas. Pure so the arithmetic is testable; the caller
 * performs the update.
 * @param {{x: number, y: number}} token  The occupant token's current position.
 * @param {{x: number, y: number}} delta  How far the vehicle moved.
 * @returns {{x: number, y: number}}  The occupant's new position.
 */
export function slavedPosition(token: { x: number; y: number }, delta: { x: number; y: number }): { x: number; y: number } {
    return { x: token.x + delta.x, y: token.y + delta.y };
}

/**
 * The movement delta between two vehicle positions, or null when it did not move.
 *
 * Returning null for a no-op is what keeps an unrelated vehicle update (a name
 * change, a flag write) from issuing a pointless position update for every
 * occupant — and, worse, from fighting a concurrent manual move.
 * @param {{x?: number, y?: number}} before  Position before the update.
 * @param {{x?: number, y?: number}} after  Position after the update.
 * @returns {{x: number, y: number} | null}  The delta, or null.
 */
export function movementDelta(
    before: { x?: number | undefined; y?: number | undefined },
    after: { x?: number | undefined; y?: number | undefined },
): { x: number; y: number } | null {
    if (typeof after.x !== 'number' && typeof after.y !== 'number') return null;
    const dx = (after.x ?? before.x ?? 0) - (before.x ?? 0);
    const dy = (after.y ?? before.y ?? 0) - (before.y ?? 0);
    if (dx === 0 && dy === 0) return null;
    return { x: dx, y: dy };
}

/** A token's rectangle in scene pixels. */
export interface TokenRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The centre of a token rectangle. */
export function centreOf(rect: TokenRect): { x: number; y: number } {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Whether a point lies inside a rectangle.
 *
 * Half-open on the far edges so two tokens sharing a border cannot both claim a
 * point that sits exactly on it — otherwise a character dropped on the seam
 * between two vehicles embarks into whichever happened to be iterated first.
 * @param {TokenRect} rect  The rectangle.
 * @param {{x: number, y: number}} point  The point.
 * @returns {boolean}  True when the point is inside.
 */
export function containsPoint(rect: TokenRect, point: { x: number; y: number }): boolean {
    return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

/**
 * Whether a move should be read as "dropped onto this vehicle".
 *
 * The test is the MOVER'S CENTRE landing inside the vehicle's footprint, not any
 * overlap: a character clipping the corner of a Chimera while running past is a
 * move, not an embarkation, and treating overlap as intent would embark people
 * who were only walking by.
 * @param {TokenRect} destination  Where the character token is landing.
 * @param {TokenRect} vehicle  The vehicle token's footprint.
 * @returns {boolean}  True when the drop lands on the vehicle.
 */
export function droppedOnto(destination: TokenRect, vehicle: TokenRect): boolean {
    return containsPoint(vehicle, centreOf(destination));
}
