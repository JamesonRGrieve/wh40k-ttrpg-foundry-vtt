import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipAssaultShip } from '../../rules/ship-assault.ts';
import { assaultContext, formValues, queueRolls, QueuedRollStub, recordingShip } from '../../testing/ship-assault.ts';
import { BOARD_FLOW, BOARDING_ROUND_FLOW } from './boarding-flow.ts';

/**
 * Boarding flows (#188) wired end to end against the pure rules: the lock-on
 * test, the opposed Command round, the winner's degree allocation, damage
 * applied to the LOSER, and the loser's Morale check.
 */

const ATTACKER: ShipAssaultShip = {
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
const DEFENDER: ShipAssaultShip = { ...ATTACKER, name: 'Whispering Star', crewPopulation: 55, hullIntegrity: 28, morale: 60 };

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('board flow — lock on', () => {
    it('rolls Hard (−20) Pilot + Manoeuvrability and previews the lock card', async () => {
        queueRolls(30);
        const session = BOARD_FLOW.start(assaultContext(recordingShip(ATTACKER), recordingShip(DEFENDER)));
        await session.roll(formValues({ pilotSkill: 40 }));
        expect(QueuedRollStub.formulas).toEqual(['1d100']);
        const card = session.previewCard();
        const lock = card?.data['lock'] as { test: { target: number; success: boolean; modifierSources: { value: number }[] } };
        expect(lock.test.target).toBe(35);
        expect(lock.test.success).toBe(true);
        expect(lock.test.modifierSources.map((row) => row.value)).toEqual([15, -20]);
        expect(session.choiceGroups()).toEqual([]);
    });

    it('is offered on the Manoeuvres tab', () => {
        expect(BOARD_FLOW.tab).toBe('manoeuvre');
        expect(BOARDING_ROUND_FLOW.tab).toBe('manoeuvre');
    });
});

describe('boarding-round flow', () => {
    async function rolledRound(isOwner = true): Promise<{
        session: ReturnType<typeof BOARDING_ROUND_FLOW.start>;
        defender: ReturnType<typeof recordingShip>;
        attacker: ReturnType<typeof recordingShip>;
    }> {
        const attacker = recordingShip(ATTACKER);
        const defender = recordingShip(DEFENDER, { isOwner });
        const session = BOARDING_ROUND_FLOW.start(assaultContext(attacker, defender));
        queueRolls(8, 60);
        await session.roll(formValues({ attackerCommand: 50, defenderCommand: 45, defenderFailedBreakFree: true }));
        return { session, attacker, defender };
    }

    it('composes both Command targets with crew, turret and break-free terms', async () => {
        const { session } = await rolledRound();
        const round = session.previewCard()?.data['round'] as { attackerTest: { target: number }; defenderTest: { target: number }; degrees: number };
        expect(round.attackerTest.target).toBe(80);
        expect(round.defenderTest.target).toBe(35);
        // Roll 8 against 80: a 72-point margin is 7 RT degrees (the +1 count said 8); the defender failed.
        expect(round.degrees).toBe(7);
    });

    it('asks the winner how to spend its degrees, capped at the margin', async () => {
        const { session } = await rolledRound();
        const field = session.choiceGroups()[0]?.fields[0];
        expect(field).toMatchObject({ name: 'hullDegrees', min: 0, max: 7 });
    });

    it('counts the Gen 2 way only under that world override', async () => {
        const session = BOARDING_ROUND_FLOW.start(assaultContext(recordingShip(ATTACKER), recordingShip(DEFENDER), 'gen2'));
        queueRolls(8, 60);
        await session.roll(formValues({ attackerCommand: 50, defenderCommand: 45, defenderFailedBreakFree: true }));
        // Gen 2: 1 + (tens 8 − tens 0) = 9 against a failed defender.
        expect((session.previewCard()?.data['round'] as { degrees: number }).degrees).toBe(9);
    });

    it('applies hull and crew damage to the loser, then tests its Morale', async () => {
        const { session, attacker, defender } = await rolledRound();
        queueRolls({ total: 12, dice: [3, 3, 3, 3] }, { total: 10, dice: [1, 2, 3, 4] }, 70);
        const applied = await session.apply(formValues({ hullDegrees: 3 }));
        expect(QueuedRollStub.formulas).toEqual(['4d5', '4d5', '1d100']);
        expect(defender.hullHits).toEqual([3]);
        expect(defender.crewHits).toEqual([[12, 10]]);
        expect(attacker.hullHits).toEqual([]);
        const morale = applied?.card.data['morale'] as { fightsOn: boolean; value: number; roll: number };
        expect(morale).toMatchObject({ roll: 70, value: 60, fightsOn: false });
        expect(applied?.rolls).toHaveLength(5);
    });

    it('leaves a ship it does not own untouched and says so on the card', async () => {
        const { session, defender } = await rolledRound(false);
        queueRolls({ total: 4, dice: [4] }, { total: 2, dice: [2] }, 10);
        const applied = await session.apply(formValues({ hullDegrees: 7 }));
        expect(defender.hullHits).toEqual([]);
        expect(defender.crewHits).toEqual([]);
        expect(applied?.card.data['unapplied']).toBe(true);
    });
});
