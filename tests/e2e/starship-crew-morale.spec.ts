import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { expect, test } from './lib/test';
import {
    chatMessageIds,
    createShip,
    joinShipWorld,
    deleteActors,
    deleteCombat,
    deleteMessages,
    messagesSince,
    openSheet,
    readShip,
    RT_FRIGATE,
    rollShipActionFromSheet,
    setCombatRound,
    showTab,
    snapShipVitals,
    snapWindow,
    startCombat,
    type ShipFixture,
    type ShownVitals,
} from './ship-sheet-driver';

/**
 * Tier B coverage of the Rogue Trader Crew Population & Morale economy (#189).
 * A hull hit in Strategic Turn 1 costs the ship Crew and
 * Morale too; in Turn 2 the GM rolls Hold Fast! and Triage from the voidcraft
 * sheet's Extended Actions tab, and each success cancels part of the previous
 * turn's Morale or Crew Population loss — never Hull Integrity, and never more
 * than the pool lost. The Crew tab is captured after the hit and after the
 * actions; each dialog and card is captured as it is rolled.
 *
 * The hit itself is fixture setup through `applyHullDamage`, the path every
 * void-combat hit takes; the actions are real clicks. Dice are queued per roll.
 */

const SHIP: ShipFixture = { ...RT_FRIGATE, name: 'Crew Economy Frigate', population: 100, morale: 100, crewRating: 30 };

/** Apply a hull hit through the document (the path weapon fire and ramming take). */
async function hullHit(page: Page, actorId: string, amount: number): Promise<void> {
    await page.evaluate(
        async ({ id, value }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { actors: { get: (i: string) => { applyHullDamage: (n: number) => Promise<object> } | undefined } } };
            await g.game.actors.get(id)?.applyHullDamage(value);
        },
        { id: actorId, value: amount },
    );
}

/** Snap the sheet's Crew tab and its sidebar vitals; returns the vitals it shows. */
async function snapCrewTab(page: Page, actorId: string, label: string): Promise<ShownVitals> {
    const sheetId = await openSheet(page, actorId);
    await showTab(page, sheetId, 'crew');
    expect(await snapWindow(page, label, sheetId), `${label} screenshot`).not.toBeNull();
    return snapShipVitals(page, actorId, `${label}-vitals`);
}

test.describe.serial('Starship Crew/Morale economy (Tier B · #189)', () => {
    test('Hold Fast! and Triage, rolled from the sheet, cancel last turn’s Morale and Crew losses', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, SHIP);
        const combat = await startCombat(page);
        const before = await chatMessageIds(page);
        try {
            // Strategic Turn 1: a 5-point hull hit also costs 5 Crew Population and 5 Morale.
            await hullHit(page, ship.id, 5);
            expect(await readShip(page, ship.id)).toMatchObject({ hull: 30, population: 95, morale: 95 });
            expect(await snapCrewTab(page, ship.id, 'starship-crew-morale-after-hit')).toEqual({ hull: '30', morale: '95', population: '95' });

            await setCombatRound(page, combat, 2);

            // Willpower 50, roll 10: 4 extra degrees → 1 + 4 = 5 Morale restored.
            const holdFast = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Hold Fast!',
                label: 'ship-action-hold-fast',
                skill: 50,
                faces: [10],
            });
            expect(holdFast.dialogTitle).toBe('Hold Fast!');
            expect(holdFast.unusedDice).toBe(0);
            expect(holdFast.card.text).toContain("Last turn's Morale damage reduced: 5 Morale restored.");
            expect(await readShip(page, ship.id)).toMatchObject({ hull: 30, population: 95, morale: 100 });

            // Medicae 60 − 10 = 50, roll 10: 4 extra degrees → 5 Crew Population restored.
            const triage = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Triage',
                label: 'ship-action-triage',
                skill: 60,
                faces: [10],
            });
            expect(triage.card.text).toContain('Printed difficulty');
            expect(triage.card.text).toContain("Last turn's Crew Population damage reduced: 5 Crew Population restored.");
            // Neither action restores Hull Integrity.
            expect(await readShip(page, ship.id)).toMatchObject({ hull: 30, population: 100, morale: 100 });
            expect(await snapCrewTab(page, ship.id, 'starship-crew-morale-after-hold-fast-triage')).toEqual({ hull: '30', morale: '100', population: '100' });

            // The previous turn's Morale loss is spent: a second Hold Fast! has nothing to cancel.
            const again = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Hold Fast!',
                label: 'ship-action-hold-fast-nothing-left',
                skill: 50,
                faces: [10],
            });
            expect(again.card.text).toContain('The ship took no Morale damage last turn that is left to cancel.');
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [ship.id]);
            await deleteCombat(page, combat);
        }
        recordCoverage('ship-action.flow', 'hold-fast');
        recordCoverage('ship-action.flow', 'triage');
        recordCoverage('starship.applyHullDamage', 'CrewMoraleEconomy');
    });

    test('replenishing between combats refills Morale; a non-RT hull’s hits leave its crew alone', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, { ...SHIP, morale: 100 });
        const dh2 = await createShip(page, { ...SHIP, name: 'DH2 Hull Probe', gameSystem: 'dh2', hullIntegrity: 30, population: 50, morale: 50 });
        try {
            await hullHit(page, ship.id, 5);
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                const g = globalThis as unknown as { game: { actors: { get: (i: string) => { replenishBetweenCombat: () => Promise<void> } | undefined } } };
                await g.game.actors.get(id)?.replenishBetweenCombat();
            }, ship.id);
            // Morale refills; Crew Population does not (recruitment is an Endeavour).
            expect(await readShip(page, ship.id)).toMatchObject({ hull: 30, population: 95, morale: 100 });

            await hullHit(page, dh2.id, 4);
            expect(await readShip(page, dh2.id)).toMatchObject({ hull: 26, population: 50, morale: 50 });
            expect(await snapCrewTab(page, dh2.id, 'starship-crew-morale-non-rt-hit')).toEqual({ hull: '26', morale: '50', population: '50' });
        } finally {
            await deleteActors(page, [ship.id, dh2.id]);
        }
        recordCoverage('starship.applyHullDamage', 'NonRtGate');
    });
});
