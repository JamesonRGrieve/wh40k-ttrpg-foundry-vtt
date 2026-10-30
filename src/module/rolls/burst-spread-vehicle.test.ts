import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';
import type { VehicleTargetProfile } from './vehicle-strike.ts';

/**
 * A burst's extra hits spread onto a second target (#513, #678; DH2):
 * each spread hit lands on its own actor, and a spread craft takes its hits as a
 * vehicle — on its own locations and armour, every hit reading a fresh location
 * roll. The hit itself and the cues are stubbed; which hits are created against
 * which vehicle, and for which actor, is asserted.
 */

vi.mock('./attack-cue-trigger.ts', () => ({ cueHitsResolved: vi.fn(), cueAttackResolved: vi.fn(), CUE_EFFECT: {} }));

installApplicationV2Stub();
const { WeaponActionData } = await import('./action-data.ts');
const { Hit } = await import('./damage-data.ts');

/** A craft's profile as the attack path builds it; only identity matters to the allocation. */
function craft(line: string, spreadTarget: boolean): VehicleTargetProfile {
    return {
        line,
        rules: { hitLocations: null, righteousFuryDie: '1d5', righteousFuryNeedsDamage: false },
        facing: 'front',
        facingAssumed: false,
        fromAboveOrBelow: false,
        incomingToHit: [],
        motion: { moving: false, airborne: false, mobile: true },
        spreadTarget,
        mounts: { hasTurret: false, weaponFacings: [] },
        forceField: null,
        righteousFuryDie: '1d5',
        righteousFuryDieSource: '',
        critMultiplier: null,
        critExcludesRighteousFury: false,
        critMultiplierSources: [],
    };
}

/** A three-hit burst at `declared`, spread onto one neighbour. */
async function burst(declaredIsCraft: boolean): Promise<{ action: InstanceType<typeof WeaponActionData>; vehicles: (VehicleTargetProfile | null)[] }> {
    const vehicles: (VehicleTargetProfile | null)[] = [];
    vi.spyOn(Hit, 'createHit').mockImplementation(async (_attack, _index, _location, vehicle) => {
        vehicles.push(vehicle ?? null);
        return Promise.resolve(new Hit());
    });
    const action = new WeaponActionData();
    action.rollData.success = true;
    // eslint-disable-next-line no-restricted-syntax -- test: the hit calculation reads only the roll's total
    action.rollData.roll = { total: 34 } as unknown as typeof action.rollData.roll;
    // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the target actor (a Foundry Actor cannot be built under happy-dom)
    action.rollData.targetActor = { id: 'lead', name: 'Lead Chimera', uuid: 'Actor.lead', system: { gameSystem: 'dh2' } } as unknown as WH40KBaseActor;
    action.rollData.hitAllocation = 'spread';
    action.rollData.spreadTargets = [{ id: 'token-wing', name: 'Wing Chimera', actorUuid: 'Actor.wing' }];
    action.rollData.vehicleTargets = { 'Actor.wing': craft('dh2', true), ...(declaredIsCraft ? { 'Actor.lead': craft('dh2', false) } : {}) };
    action.damageData.additionalHits = 2;
    await action.calculateHits();
    return { action, vehicles };
}

describe("a burst's hits spread onto a second vehicle (#678)", () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key }, wh40k: { log: vi.fn() } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('strikes the spread craft as a vehicle, with every hit reading a fresh location roll', async () => {
        const { action, vehicles } = await burst(true);
        // Round-robin: lead, wing, lead.
        expect(vehicles.map((vehicle) => vehicle?.spreadTarget)).toEqual([false, true, false]);
        expect(action.damageData.hits.map((hit) => hit.targetUuid)).toEqual(['', 'Actor.wing', '']);
        expect(action.damageData.hits.map((hit) => hit.targetName)).toEqual(['Lead Chimera', 'Wing Chimera', 'Lead Chimera']);
    });

    it('lands a hit spread from a creature onto a craft on that craft, as a vehicle hit', async () => {
        const { action, vehicles } = await burst(false);
        expect(vehicles.map((vehicle) => vehicle?.spreadTarget ?? null)).toEqual([null, true, null]);
        expect(action.damageData.hits[1]?.targetUuid).toBe('Actor.wing');
    });
});
