import { afterEach, describe, expect, it, vi } from 'vitest';
import { occupantCandidateActors } from './vehicle-embark.ts';
import { ABOARD_FLAG, type OccupantLike, occupantsOf } from './vehicle-occupancy.ts';

const SYSTEM_ID = 'wh40k-rpg';
// An unlinked token's actor uuid is token-scoped, not a bare world `Actor.<id>`.
const VEHICLE = 'Scene.scn1.Token.tok9.Actor.veh';

/** A character carrying an `aboard` flag pointing at a vehicle. */
function aboard(vehicleUuid: string, role: string, name = 'Acolyte'): OccupantLike {
    return { name, flags: { [SYSTEM_ID]: { [ABOARD_FLAG]: { vehicleUuid, role } } } };
}

/** Stub the two collections `occupantCandidateActors` scans. */
function stubWorldAndCanvas(worldActors: OccupantLike[], tokenActors: Array<OccupantLike | null>): void {
    vi.stubGlobal('game', { actors: worldActors });
    vi.stubGlobal('canvas', { tokens: { placeables: tokenActors.map((actor) => ({ actor })) } });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('occupantCandidateActors (#557 — embarked occupant missing from the crew list)', () => {
    it('includes canvas token actors that are absent from game.actors', () => {
        // The regression: every placed token is an UNLINKED actor copy (#479), so
        // the embarked character's synthetic actor is not in `game.actors`. Scanning
        // only the world collection missed it, and the crew roster stayed empty.
        const worldPc = aboard('Actor.elsewhere', 'driver', 'Sidebar PC');
        const tokenPc = aboard(VEHICLE, 'driver', 'Token PC');
        stubWorldAndCanvas([worldPc], [tokenPc]);

        const candidates = occupantCandidateActors();
        expect(candidates).toContain(worldPc);
        expect(candidates).toContain(tokenPc);
        // The point of the fix: the token-scoped occupant now resolves.
        expect(occupantsOf(VEHICLE, candidates).map((o) => o.actor)).toEqual([tokenPc]);
    });

    it('dedupes a linked token whose .actor is its world actor', () => {
        const linked = aboard(VEHICLE, 'gunner');
        // A linked token exposes the SAME actor object the world collection holds.
        stubWorldAndCanvas([linked], [linked]);
        expect(occupantCandidateActors().filter((a) => a === linked)).toHaveLength(1);
    });

    it('skips placed tokens that have no actor', () => {
        const worldPc = aboard(VEHICLE, 'passenger');
        stubWorldAndCanvas([worldPc], [null]);
        expect(occupantCandidateActors()).toEqual([worldPc]);
    });
});
