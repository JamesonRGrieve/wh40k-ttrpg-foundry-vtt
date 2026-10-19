import { recordCoverage } from './lib/coverage-tracker';
import { expect, test } from './lib/test';
import {
    chatMessageIds,
    createShip,
    joinShipWorld,
    deleteActors,
    deleteMessages,
    messagesSince,
    provenanceRows,
    readShip,
    RT_FRIGATE,
    runAssaultFromSheet,
    snapShipVitals,
    type ShipFixture,
} from './ship-sheet-driver';

/**
 * Tier B coverage of the Boarding Action (#188 — RT Core p.215), run from the
 * voidcraft sheet's Manoeuvres-tab Ship Assault panel the way a GM does:
 *
 *   1. Board — the Hard (−20) Pilot (Space Craft) + Manoeuvrability Test that
 *      locks the two ships together.
 *   2. Boarding Round — the opposed Command Test (Crew Population, Hull
 *      Integrity and Turret bonuses), the winner spending each degree on 1 Hull
 *      Integrity or 1d5 Crew Population + 1d5 Morale, and the loser's Morale
 *      check. The damage lands on the losing ship.
 */

const BOARDER: ShipFixture = { ...RT_FRIGATE, name: 'Errant Vector (Boarding)', crewRating: 50 };
const CORSAIR: ShipFixture = {
    ...RT_FRIGATE,
    name: 'Eldar Corsair',
    hullType: 'raider',
    manoeuvrability: 20,
    armour: 16,
    hullIntegrity: 28,
    population: 55,
    morale: 60,
    crewRating: 45,
};

test.describe.serial('Ship Boarding from the voidcraft sheet (Tier B · #188)', () => {
    test('Board locks the ships together', async ({ page }) => {
        await joinShipWorld(page);
        const boarder = await createShip(page, BOARDER);
        const corsair = await createShip(page, CORSAIR);
        const before = await chatMessageIds(page);
        try {
            // Pilot 50 + Manoeuvrability 15 − 20 = 45, rolls 30.
            const ran = await runAssaultFromSheet(page, boarder.id, {
                tab: 'manoeuvreActions',
                assault: 'board',
                label: 'ship-boarding-lock',
                defender: CORSAIR.name,
                inputs: { pilotSkill: 50 },
                choices: {},
                faces: [30],
            });
            expect(ran.unusedDice).toBe(0);
            expect(ran.card.text).toContain('Boarding Action — Lock On');
            expect(ran.card.text).toContain('Manoeuvrability (Errant Vector (Boarding))');
            expect(ran.card.text).toContain('The ships crash together and are locked.');
            expect(provenanceRows(ran.card.html), 'Manoeuvrability and the Hard difficulty').toBeGreaterThanOrEqual(2);
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [boarder.id, corsair.id]);
        }
        recordCoverage('ship-assault.flow', 'board');
    });

    test('a Boarding Round deals the winner’s degrees to the loser and tests its Morale', async ({ page }) => {
        await joinShipWorld(page);
        const boarder = await createShip(page, BOARDER);
        const corsair = await createShip(page, CORSAIR);
        const before = await chatMessageIds(page);
        try {
            // Boarder: Command 50 + 20 (Crew 80 vs 55) + 10 (Turrets) = 80, rolls 50. RT counts each full 10
            // of margin (RT Core p.232), so that is 3 degrees — the +1 count said 4. The Corsair's Command
            // 45 + 10 = 55 fails on 60 and scores none. One degree goes on Hull, two on 2d5 Crew + 2d5 Morale;
            // the Corsair then tests its reduced Morale on a 40.
            const ran = await runAssaultFromSheet(page, boarder.id, {
                tab: 'manoeuvreActions',
                assault: 'boarding-round',
                label: 'ship-boarding-round',
                defender: CORSAIR.name,
                inputs: { attackerCommand: 50, defenderCommand: 45 },
                choices: { hullDegrees: 1 },
                faces: [50, 60, 2, 3, 1, 2, 40],
            });
            expect(ran.inputNames).toEqual(
                expect.arrayContaining(['attackerCommand', 'attackerFailedBreakFree', 'defenderCommand', 'defenderFailedBreakFree']),
            );
            expect(ran.preview, 'the resolved dialog previews both Command Tests').toContain('Errant Vector (Boarding) wins the Command Test by 3 degrees.');
            expect(ran.unusedDice).toBe(0);

            expect(ran.card.html).toContain('data-wh40k-system="rt"');
            expect(ran.card.text).toContain('Larger Crew Population (80 vs 55)');
            expect(ran.card.text).toContain('Turret Rating 1');
            expect(ran.card.text).toContain('Success — 3 DoS');
            expect(ran.card.text).toContain('3 DoS = ⌊30 ÷ 10⌋ (roll 50 vs target 80)');
            expect(ran.card.text).toContain('Failure — 0 DoF');
            expect(ran.card.text).toContain('Hull Integrity damage (1 per degree)');
            expect(ran.card.text).toContain('Crew Population damage (1d5 per degree)');
            expect(ran.card.text).toContain('Morale damage (1d5 per degree)');
            expect(ran.card.text).toContain('Eldar Corsair tests Morale: rolled 40 against 56.');
            expect(ran.card.text).toContain('The crew fights on.');
            // #663: one degree on Hull reads singular, the 3-degree win plural, and nothing hedges "(s)".
            expect(ran.card.text).toContain('1 degree setting charges');
            expect(ran.card.text).toContain('wins the Command Test by 3 degrees.');
            expect(ran.card.text).not.toContain('(s)');
            expect(ran.card.html.split('data-wh40k-hook="ship-assault-damage"').length - 1, 'Hull, Crew and Morale sections').toBe(3);

            // Hull 28 − 1 (which also costs 1 Crew and 1 Morale), then 2+3 = 5 Crew and 1+2 = 3 Morale.
            expect(await readShip(page, corsair.id)).toMatchObject({ hull: 27, population: 49, morale: 56 });
            expect(await readShip(page, boarder.id)).toMatchObject({ hull: 35, population: 80, morale: 75 });
            expect(await snapShipVitals(page, corsair.id, 'ship-boarding-round-loser-after')).toEqual({ hull: '27', morale: '56', population: '49' });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [boarder.id, corsair.id]);
        }
        recordCoverage('ship-assault.flow', 'boarding-round');
    });
});
