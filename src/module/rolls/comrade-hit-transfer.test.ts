import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { ComradeRecord } from '../rules/ow-comrade.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';

/**
 * The damage path's Comrade hit transfer (#152; OW Core p. 271): when an attack's
 * hits are calculated against a PC whose Comrade is in Cohesion, a successful hit
 * roll on doubles sends one hit to the Comrade instead, and the rest land on the PC.
 * The hit itself and the cues are stubbed; which hits are created is asserted.
 */

vi.mock('./attack-cue-trigger.ts', () => ({ cueHitsResolved: vi.fn(), cueAttackResolved: vi.fn(), CUE_EFFECT: {} }));

installApplicationV2Stub();
const { WeaponActionData } = await import('./action-data.ts');
const { Hit } = await import('./damage-data.ts');

const COMRADE: ComradeRecord = {
    name: 'Comrade Jaeger',
    state: 'unharmed',
    distanceM: 2,
    hasVisualLine: true,
    fleeing: false,
    pinned: false,
    fearImmune: false,
    pinningImmune: false,
    turn: { combatId: '', round: 0, halvesSpent: 0 },
    mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
};

/** A targeted attack against an Only War PC with the given Comrade, rolling `roll` for `hits` hits. */
async function attack(roll: number, hits: number, comrade: ComradeRecord, line = 'ow'): Promise<InstanceType<typeof WeaponActionData>> {
    const action = new WeaponActionData();
    action.rollData.success = roll <= 60;
    // eslint-disable-next-line no-restricted-syntax -- test: the hit calculation reads only the roll's total
    action.rollData.roll = { total: roll } as unknown as typeof action.rollData.roll;
    // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the target actor (a Foundry Actor cannot be built under happy-dom)
    action.rollData.targetActor = { id: 'pc', name: 'Trooper Halden', uuid: 'Actor.pc', system: { gameSystem: line, comrade } } as unknown as WH40KBaseActor;
    action.damageData.additionalHits = hits - 1;
    await action.calculateHits();
    return action;
}

describe('the Comrade hit transfer in the damage path (#152)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key }, wh40k: { log: vi.fn() } });
        vi.spyOn(Hit, 'createHit').mockImplementation(async () => Promise.resolve(new Hit()));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('a hit on doubles strikes the Comrade instead: one hit of a burst, the rest land on the PC', async () => {
        const action = await attack(33, 3, COMRADE);
        expect(action.comradeHit).toEqual({ actorUuid: 'Actor.pc', comradeName: 'Comrade Jaeger' });
        expect(action.damageData.hits).toHaveLength(2);
    });

    it('a single hit on doubles goes to the Comrade, and none to the PC', async () => {
        const action = await attack(22, 1, COMRADE);
        expect(action.comradeHit).not.toBeNull();
        expect(action.damageData.hits).toHaveLength(0);
    });

    it('no doubles, a Comrade out of Cohesion, or a line without Comrades: every hit lands on the PC', async () => {
        for (const [roll, comrade, line] of [
            [34, COMRADE, 'ow'],
            [33, { ...COMRADE, distanceM: 9 }, 'ow'],
            [33, COMRADE, 'dh2'],
        ] as const) {
            // eslint-disable-next-line no-await-in-loop -- each case resolved in turn
            const action = await attack(roll, 2, comrade, line);
            expect(action.comradeHit).toBeNull();
            expect(action.damageData.hits).toHaveLength(2);
        }
    });
});
