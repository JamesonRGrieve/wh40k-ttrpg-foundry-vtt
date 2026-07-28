import { describe, expect, it } from 'vitest';
import {
    ABOARD_FLAG,
    canEmbark,
    capacityOf,
    centreOf,
    containsPoint,
    defaultRole,
    droppedOnto,
    movementDelta,
    type Occupant,
    type OccupantLike,
    occupantsOf,
    readAboard,
    slavedPosition,
    type TokenRect,
    unfilledCrew,
    type VehicleRole,
} from './vehicle-occupancy.ts';

const SYSTEM_ID = 'wh40k-rpg';
const VEHICLE = 'Actor.chimera01';

/** A character carrying an `aboard` flag. */
function aboard(vehicleUuid: string, role: string, name = 'Acolyte'): OccupantLike {
    return { name, flags: { [SYSTEM_ID]: { [ABOARD_FLAG]: { vehicleUuid, role } } } };
}

/** An occupant list of the given seats. */
function seats(...roles: VehicleRole[]): Occupant<OccupantLike>[] {
    return roles.map((role) => ({ actor: aboard(VEHICLE, role), role }));
}

const chimera = { crew: 2, passengers: 12 };
const sentinel = { crew: 1, passengers: 0 };

describe('readAboard (#508)', () => {
    it('reads a well-formed aboard flag', () => {
        expect(readAboard(aboard(VEHICLE, 'driver'))).toEqual({ vehicleUuid: VEHICLE, role: 'driver' });
    });

    it('reads null for a character that is not aboard anything', () => {
        expect(readAboard({ flags: {} })).toBeNull();
        expect(readAboard(null)).toBeNull();
        expect(readAboard(undefined)).toBeNull();
    });

    it('rejects a half-written flag rather than inventing a seat', () => {
        // A hand-edited or partially-written flag must read as "not aboard",
        // not as an occupant with an undefined role.
        expect(readAboard({ flags: { [SYSTEM_ID]: { [ABOARD_FLAG]: { vehicleUuid: VEHICLE } } } })).toBeNull();
        expect(readAboard({ flags: { [SYSTEM_ID]: { [ABOARD_FLAG]: { role: 'driver' } } } })).toBeNull();
        expect(readAboard({ flags: { [SYSTEM_ID]: { [ABOARD_FLAG]: { vehicleUuid: '', role: 'driver' } } } })).toBeNull();
    });

    it('rejects a role outside the declared seats', () => {
        expect(readAboard(aboard(VEHICLE, 'stowaway'))).toBeNull();
    });
});

describe('occupantsOf', () => {
    it('finds only the characters aboard THIS vehicle', () => {
        const actors = [aboard(VEHICLE, 'driver', 'Gus'), aboard('Actor.other', 'driver', 'Elsewhere'), { flags: {} }];
        expect(occupantsOf(VEHICLE, actors).map((o) => o.actor.name)).toEqual(['Gus']);
    });

    it('orders the roster by seat, not by actor order', () => {
        const actors = [aboard(VEHICLE, 'passenger', 'P'), aboard(VEHICLE, 'driver', 'D'), aboard(VEHICLE, 'gunner', 'G')];
        expect(occupantsOf(VEHICLE, actors).map((o) => o.actor.name)).toEqual(['D', 'G', 'P']);
    });

    it('returns an empty roster for an empty vehicle', () => {
        expect(occupantsOf(VEHICLE, [{ flags: {} }])).toEqual([]);
    });
});

describe('capacityOf', () => {
    it('reads crew.required and passengers', () => {
        expect(capacityOf({ crew: { required: 2 }, passengers: 12 })).toEqual({ crew: 2, passengers: 12 });
    });

    it('defaults missing or non-numeric capacity to zero rather than NaN', () => {
        expect(capacityOf({})).toEqual({ crew: 0, passengers: 0 });
        expect(capacityOf({ crew: { required: 'two' }, passengers: null })).toEqual({ crew: 0, passengers: 0 });
        expect(capacityOf(undefined)).toEqual({ crew: 0, passengers: 0 });
    });

    it('never reports negative seating', () => {
        expect(capacityOf({ crew: { required: -3 }, passengers: -1 })).toEqual({ crew: 0, passengers: 0 });
    });
});

describe('canEmbark', () => {
    it('admits an occupant while there is room', () => {
        expect(canEmbark(seats('driver'), chimera, 'passenger').allowed).toBe(true);
    });

    it('refuses a second driver — two people cannot steer it', () => {
        const verdict = canEmbark(seats('driver'), chimera, 'driver');
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('already has a driver');
    });

    it('counts crew and passenger capacity SEPARATELY', () => {
        // A Chimera with a full troop bay can still be missing its driver;
        // reporting "full" for that would be the wrong answer.
        const fullBay = seats(...(Array.from({ length: 12 }, () => 'passenger') as VehicleRole[]));
        expect(canEmbark(fullBay, chimera, 'passenger').allowed).toBe(false);
        expect(canEmbark(fullBay, chimera, 'driver').allowed).toBe(true);
    });

    it('refuses a passenger on a vehicle with no passenger space (a Sentinel)', () => {
        const verdict = canEmbark([], sentinel, 'passenger');
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('No passenger space');
    });

    it('refuses more crew than the vehicle takes', () => {
        expect(canEmbark(seats('driver'), sentinel, 'gunner').allowed).toBe(false);
    });
});

describe('unfilledCrew', () => {
    it('reports what the vehicle is still missing, not just whether it is full', () => {
        expect(unfilledCrew(seats('driver'), chimera)).toBe(1);
        expect(unfilledCrew(seats('driver', 'gunner'), chimera)).toBe(0);
    });

    it('does not count passengers toward crew', () => {
        expect(unfilledCrew(seats('passenger', 'passenger'), chimera)).toBe(2);
    });

    it('never reports negative when overfull', () => {
        expect(unfilledCrew(seats('driver', 'gunner', 'crew'), sentinel)).toBe(0);
    });
});

describe('defaultRole', () => {
    it('seats the first occupant as the driver — an undriven vehicle is the useless case', () => {
        expect(defaultRole([], chimera)).toBe('driver');
    });

    it('falls through to the next free crew seat, then to passenger', () => {
        expect(defaultRole(seats('driver'), chimera)).toBe('gunner');
        expect(defaultRole(seats('driver', 'gunner'), chimera)).toBe('passenger');
    });

    it('returns null when nothing is free', () => {
        expect(defaultRole(seats('driver'), sentinel)).toBeNull();
    });
});

describe('token slaving', () => {
    it('moves an occupant by the same delta the vehicle moved', () => {
        expect(slavedPosition({ x: 100, y: 200 }, { x: -50, y: 25 })).toEqual({ x: 50, y: 225 });
    });

    it('reports the delta between two vehicle positions', () => {
        expect(movementDelta({ x: 100, y: 100 }, { x: 150, y: 80 })).toEqual({ x: 50, y: -20 });
    });

    it('reports null when the vehicle did not move', () => {
        // An unrelated update — a rename, a flag write — must not issue a
        // pointless position update for every occupant, nor fight a concurrent move.
        expect(movementDelta({ x: 100, y: 100 }, {})).toBeNull();
        expect(movementDelta({ x: 100, y: 100 }, { x: 100, y: 100 })).toBeNull();
    });

    it('handles a single-axis move, where the other coordinate is absent from the update', () => {
        expect(movementDelta({ x: 100, y: 100 }, { x: 140 })).toEqual({ x: 40, y: 0 });
        expect(movementDelta({ x: 100, y: 100 }, { y: 60 })).toEqual({ x: 0, y: -40 });
    });
});

describe('droppedOnto — the drag-onto-vehicle gesture (#508)', () => {
    /** A Chimera occupying a 2×2 block of 100px squares at the origin. */
    const chimeraRect = { x: 0, y: 0, width: 200, height: 200 };
    /** A 100px character token. */
    const rider = (x: number, y: number): TokenRect => ({ x, y, width: 100, height: 100 });

    it('reads a drop whose centre lands inside the vehicle as boarding it', () => {
        expect(droppedOnto(rider(50, 50), chimeraRect)).toBe(true);
    });

    it('does NOT read a corner clip as boarding — running past is not embarking', () => {
        // The mover's centre is at (-50, -50): it overlaps the Chimera's corner
        // but is mostly outside. Any-overlap detection would embark a character
        // who merely ran past, which is the whole reason the test is on the centre.
        expect(droppedOnto(rider(-100, -100), chimeraRect)).toBe(false);
    });

    it('is false for a drop entirely clear of the vehicle', () => {
        expect(droppedOnto(rider(500, 500), chimeraRect)).toBe(false);
    });

    it('treats the far edge as outside, so a shared border is claimed by one vehicle only', () => {
        // Centre exactly on the far edge belongs to the NEXT square, not this one —
        // otherwise a character dropped on the seam between two vehicles embarks
        // into whichever happened to be iterated first.
        expect(containsPoint(chimeraRect, { x: 200, y: 100 })).toBe(false);
        expect(containsPoint(chimeraRect, { x: 0, y: 0 })).toBe(true);
    });

    it('centres a token on its own footprint', () => {
        expect(centreOf({ x: 40, y: 60, width: 100, height: 200 })).toEqual({ x: 90, y: 160 });
    });
});
