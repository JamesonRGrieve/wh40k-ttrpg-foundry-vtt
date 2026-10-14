import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipAssaultShip } from '../../rules/ship-assault.ts';
import type { RammingProfile } from '../../rules/ship-ramming.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { readRepoFile } from '../../testing/repo-file.ts';
import { assaultContext, formValues, queueRolls, QueuedRollStub, recordingShip, type RecordingShip } from '../../testing/ship-assault.ts';
import { createRammingFlow, RAMMING_ORDER_IDENTIFIER } from './ramming-flow.ts';
import { ShipAssaultInputError, type ShipAssaultSession } from './ship-assault-flow.ts';

/**
 * Ramming flow (#188) end to end: the test, the hull-size die read from the
 * Ramming Speed content, the rebound onto the rammer, and both hits landing on
 * Hull Integrity directly (void shields ignored).
 */

const RAMMER: ShipAssaultShip = {
    name: 'Errant Vector',
    hullType: 'frigate',
    manoeuvrability: 15,
    crippledManoeuvrability: 0,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 75,
};
const TARGET: ShipAssaultShip = { ...RAMMER, name: 'Whispering Star', hullType: 'raider', armour: 16 };
const PROFILE: RammingProfile = { damage: [{ hullType: 'frigate', formula: '1d10' }], reboundDamage: '1d5' };

afterEach(() => {
    vi.unstubAllGlobals();
});

interface Started {
    session: ShipAssaultSession;
    rammer: RecordingShip;
    target: RecordingShip;
}

function start(profile: RammingProfile | null, hullType = RAMMER.hullType): Started {
    const rammer = recordingShip({ ...RAMMER, hullType });
    const target = recordingShip(TARGET);
    return { session: createRammingFlow(async () => Promise.resolve(profile)).start(assaultContext(rammer, target)), rammer, target };
}

describe('ramming flow', () => {
    it('is offered on the Manoeuvres tab', () => {
        expect(createRammingFlow(async () => Promise.resolve(null)).tab).toBe('manoeuvre');
    });

    it('rolls nothing more on a missed ram', async () => {
        const { session, rammer, target } = start(PROFILE);
        queueRolls(90);
        await session.roll(formValues({ pilotSkill: 40 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100']);
        await session.apply(formValues({}));
        expect(target.hullHits).toEqual([]);
        expect(rammer.hullHits).toEqual([]);
    });

    it('rolls the hull-size die and rebound, and damages both ships', async () => {
        const { session, rammer, target } = start(PROFILE);
        queueRolls(20, 7, 3);
        await session.roll(formValues({ pilotSkill: 40 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d10', '1d5']);
        await session.apply(formValues({}));
        expect(target.hullHits).toEqual([25]);
        expect(rammer.hullHits).toEqual([19]);
    });

    it('honours a GM-entered die and bonus over the table', async () => {
        const { session, target } = start(PROFILE);
        queueRolls(20, 9, 2, 4);
        await session.roll(formValues({ pilotSkill: 40, damageFormula: '2d5', bonusFormula: '1d10', bonusLabel: 'Power Ram' }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '2d5', '1d5', '1d10']);
        await session.apply(formValues({}));
        expect(target.hullHits).toEqual([9 + 18 + 4]);
    });

    it('refuses with a player-facing message when no die exists for the hull type', async () => {
        const { session } = start(PROFILE, 'battlecruiser');
        queueRolls(20);
        await expect(session.roll(formValues({ pilotSkill: 40 }))).rejects.toBeInstanceOf(ShipAssaultInputError);
    });
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('Ramming Speed compendium content', () => {
    it('carries the RAW hull-size dice and rebound die under its identifier', () => {
        const order = JSON.parse(readRepoFile('src/packs-private/rogue-trader/rt-core-items-ship-orders/_source/ramming-speed_0718293a4b5c6d7e.json')) as {
            system: { identifier: string; ramming: RammingProfile };
        };
        expect(order.system.identifier).toBe(RAMMING_ORDER_IDENTIFIER);
        expect(order.system.ramming).toEqual({
            damage: [
                { hullType: 'transport', formula: '1d5' },
                { hullType: 'raider', formula: '1d5' },
                { hullType: 'frigate', formula: '1d10' },
                { hullType: 'light-cruiser', formula: '2d5' },
                { hullType: 'cruiser', formula: '2d10' },
            ],
            reboundDamage: '1d5',
        });
    });
});
