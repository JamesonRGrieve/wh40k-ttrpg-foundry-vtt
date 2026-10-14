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
 * Tier B coverage of Ramming (#188 — RT Core p.215), run from the voidcraft
 * sheet the way a GM does: the Manoeuvres tab's Ship Assault panel → Ram →
 * pick the target ship and the helmsman's Pilot skill → Roll → Apply & Post.
 * The rammed ship takes the hull-size die (the Ramming Speed order's table:
 * 1d10 for a frigate) plus the rammer's prow armour; the rammer takes the
 * target's Armour plus 1d5 — both ignoring void shields, and on Rogue Trader
 * hulls each Hull point lost also costs Crew and Morale.
 */

const RAMMER: ShipFixture = { ...RT_FRIGATE, name: 'Errant Vector (Ram)', crewRating: 45 };
const TARGET: ShipFixture = {
    ...RT_FRIGATE,
    name: 'Ork Kroozer Grimskull',
    hullType: 'cruiser',
    manoeuvrability: 5,
    armour: 16,
    turretRating: 2,
    hullIntegrity: 70,
    population: 90,
    morale: 80,
};

test.describe.serial('Ship Ramming from the voidcraft sheet (Tier B · #188)', () => {
    test('rams the target from the Ship Assault panel and applies both ships’ hull damage', async ({ page }) => {
        await joinShipWorld(page);
        const rammer = await createShip(page, RAMMER);
        const target = await createShip(page, TARGET);
        const before = await chatMessageIds(page);
        try {
            // Pilot 45 + Manoeuvrability 15 − 20 + 10 (Ram Ship prow) = 50, rolls 20; the d10 rolls 7, the rebound d5 rolls 3.
            const ran = await runAssaultFromSheet(page, rammer.id, {
                tab: 'manoeuvreActions',
                assault: 'ram',
                label: 'ship-ramming',
                defender: TARGET.name,
                inputs: { pilotSkill: 45, situationalValue: 10, situationalLabel: 'Ram Ship prow' },
                choices: {},
                faces: [20, 7, 3],
            });
            expect(ran.targets).toContain(TARGET.name);
            expect(ran.targets, 'a ship never targets itself').not.toContain(RAMMER.name);
            expect(ran.inputNames).toEqual(
                expect.arrayContaining(['defender', 'pilotSkill', 'situationalValue', 'situationalLabel', 'damageFormula', 'bonusFormula']),
            );
            expect(ran.preview, 'the dialog previews the ram before it is applied').toContain('Ram — Hard (−20) Pilot (Space Craft) + Manoeuvrability');
            expect(ran.unusedDice).toBe(0);

            expect(ran.card.html).toContain('data-wh40k-system="rt"');
            expect(ran.card.text).toContain('Ram Ship prow');
            expect(ran.card.text, 'the rammer’s hull size picks the die').toContain('1d10 (frigate hull)');
            expect(ran.card.text).toContain('Prow armour (Errant Vector (Ram))');
            expect(ran.card.text).toContain(`Hull Integrity damage to ${TARGET.name} (ignores void shields)`);
            expect(ran.card.text).toContain(`Armour (${TARGET.name})`);
            expect(ran.card.text).toContain(`Hull Integrity damage to ${RAMMER.name} on impact (ignores void shields)`);
            expect(provenanceRows(ran.card.html), 'Manoeuvrability, difficulty, situational, then both damage splits').toBeGreaterThanOrEqual(6);

            // Rammed: 7 + 18 prow armour = 25. Rammer: 16 Armour + 3 = 19. Crew and Morale fall with Hull.
            expect(await readShip(page, target.id)).toMatchObject({ hull: 45, population: 65, morale: 55 });
            expect(await readShip(page, rammer.id)).toMatchObject({ hull: 16, population: 61, morale: 56 });
            expect(await snapShipVitals(page, target.id, 'ship-ramming-target-after')).toEqual({ hull: '45', morale: '55', population: '65' });
            expect(await snapShipVitals(page, rammer.id, 'ship-ramming-rammer-after')).toEqual({ hull: '16', morale: '56', population: '61' });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [rammer.id, target.id]);
        }
        recordCoverage('ship-assault.flow', 'ram');
    });

    test('a missed ram deals no damage to either ship', async ({ page }) => {
        await joinShipWorld(page);
        const rammer = await createShip(page, RAMMER);
        const target = await createShip(page, TARGET);
        const before = await chatMessageIds(page);
        try {
            // Target 40, rolls 85: the helmsman misses and no damage die is rolled.
            const ran = await runAssaultFromSheet(page, rammer.id, {
                tab: 'manoeuvreActions',
                assault: 'ram',
                label: 'ship-ramming-miss',
                defender: TARGET.name,
                inputs: { pilotSkill: 45 },
                choices: {},
                faces: [85],
            });
            expect(ran.unusedDice).toBe(0);
            expect(ran.card.text).toContain('Failure');
            expect(ran.card.html).not.toContain('data-wh40k-hook="ship-assault-damage"');
            expect(await readShip(page, target.id)).toMatchObject({ hull: 70, population: 90, morale: 80 });
            expect(await readShip(page, rammer.id)).toMatchObject({ hull: 35 });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [rammer.id, target.id]);
        }
        recordCoverage('ship-assault.flow', 'ram-miss');
    });
});
