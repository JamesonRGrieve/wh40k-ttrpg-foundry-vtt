import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipAssaultShip } from '../../rules/ship-assault.ts';
import { assaultContext, formValues, queueRolls, QueuedRollStub, recordingShip } from '../../testing/ship-assault.ts';
import { HIT_AND_RUN_FLOW } from './hit-and-run-flow.ts';

/**
 * Hit and Run flow (#188) end to end: the turret-penalised approach, the
 * opposed raid Command tests, the raider's choice between the two Critical
 * Hit rolls, and the Hull damage + Critical Hit landing on the target ship.
 */

const RAIDER: ShipAssaultShip = {
    name: 'Errant Vector',
    hullType: 'frigate',
    manoeuvrability: 15,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 75,
};
const TARGET: ShipAssaultShip = { ...RAIDER, name: 'Whispering Star', turretRating: 2 };

afterEach(() => {
    vi.unstubAllGlobals();
});

function start(isOwner = true): { session: ReturnType<typeof HIT_AND_RUN_FLOW.start>; target: ReturnType<typeof recordingShip> } {
    const target = recordingShip(TARGET, { isOwner });
    return { session: HIT_AND_RUN_FLOW.start(assaultContext(recordingShip(RAIDER), target)), target };
}

describe('hit-and-run flow', () => {
    it('is offered on the Extended Actions tab', () => {
        expect(HIT_AND_RUN_FLOW.tab).toBe('extended');
    });

    it('shoots the craft down on 4+ degrees of failure and rolls nothing else', async () => {
        const { session } = start();
        queueRolls(80);
        await session.roll(formValues({ pilotSkill: 50 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100']);
        const approach = session.previewCard()?.data['approach'] as { test: { target: number }; shotDown: boolean };
        expect(approach.test.target).toBe(30);
        expect(approach.shotDown).toBe(true);
        expect(session.choiceGroups()).toEqual([]);
    });

    it('lets the raider choose a Critical Hit and lands it with the Hull damage', async () => {
        const { session, target } = start();
        queueRolls(10, 15, 45, 2, 5);
        await session.roll(formValues({ pilotSkill: 50, attackerCommand: 50, defenderCommand: 40 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100', '1d100', '1d100', '1d5', '1d5']);
        const pick = session.choiceGroups()[0]?.fields[0];
        expect(pick).toMatchObject({ name: 'critPick', kind: 'radio', value: '1' });
        const applied = await session.apply(formValues({ critPick: '0' }));
        expect(target.hullHits).toEqual([4]);
        expect(target.criticalHits).toEqual([2]);
        expect(applied?.card.data['chosenCrit']).toBe(2);
        expect(applied?.rolls).toHaveLength(5);
    });

    it('sends repelled raiders home with no damage', async () => {
        const { session, target } = start();
        queueRolls(10, 90, 20);
        await session.roll(formValues({ pilotSkill: 50, attackerCommand: 40, defenderCommand: 40 }));
        expect(session.choiceGroups()).toEqual([]);
        await session.apply(formValues({}));
        expect(target.hullHits).toEqual([]);
        expect(target.criticalHits).toEqual([]);
    });

    it('does not touch a target ship the user does not own', async () => {
        const { session, target } = start(false);
        queueRolls(10, 15, 45, 3, 4);
        await session.roll(formValues({ pilotSkill: 50, attackerCommand: 50, defenderCommand: 40 }));
        const applied = await session.apply(formValues({ critPick: '1' }));
        expect(target.hullHits).toEqual([]);
        expect(target.criticalHits).toEqual([]);
        expect(applied?.card.data['unapplied']).toBe(true);
    });
});
