import { recordCoverage } from './lib/coverage-tracker';
import { expect, test } from './lib/test';
import {
    chatMessageIds,
    createShip,
    joinShipWorld,
    deleteActors,
    deleteMessages,
    messagesSince,
    readCard,
    readShip,
    RT_FRIGATE,
    runAssaultFromSheet,
    snapChatCard,
    snapDamageControl,
    snapShipVitals,
    type ShipFixture,
} from './ship-sheet-driver';

/**
 * Tier B coverage of Hit and Run (#188 — RT Core p.218), run from the voidcraft
 * sheet's Extended Actions tab Ship Assault panel the way a GM does: the
 * Challenging (+0) Pilot (Space Craft) approach at −10 per target Turret
 * Rating, then the opposed Ordinary (+10) Command Test. A won raid rolls 1d5
 * twice on the Critical Hit chart; the raider picks one in the resolved
 * dialog, and the target takes it plus 1 Hull Integrity per degree won by.
 */

const RAIDER: ShipFixture = { ...RT_FRIGATE, name: 'Errant Vector (Raid)', crewRating: 50 };
const BONE_TITHE: ShipFixture = {
    ...RT_FRIGATE,
    name: 'Chaos Raider Bone Tithe',
    hullType: 'raider',
    manoeuvrability: 20,
    armour: 16,
    turretRating: 2,
    hullIntegrity: 28,
    population: 55,
    morale: 60,
    crewRating: 40,
};

test.describe.serial('Ship Hit and Run from the voidcraft sheet (Tier B · #188)', () => {
    test('a won raid inflicts the raider’s chosen Critical Hit and 1 Hull per degree', async ({ page }) => {
        await joinShipWorld(page);
        const raider = await createShip(page, RAIDER);
        const target = await createShip(page, BONE_TITHE);
        const before = await chatMessageIds(page);
        try {
            // Approach: Pilot 50 − 20 (Turret Rating 2) = 30, rolls 10.
            // Command: raider 50 + 10 = 60 rolls 15 (4 RT degrees); defender 40 + 10 = 50 rolls 45 (a bare pass,
            // 0 RT degrees). The raid wins by 4;
            // the Critical Hit rolls are 2 and 5 and the raider picks the 5.
            const ran = await runAssaultFromSheet(page, raider.id, {
                tab: 'extendedActions',
                assault: 'hit-and-run',
                label: 'ship-hit-and-run',
                defender: BONE_TITHE.name,
                inputs: { pilotSkill: 50, attackerCommand: 50, defenderCommand: 40 },
                choices: { critPick: '1' },
                faces: [10, 15, 45, 2, 5],
            });
            expect(ran.preview).toContain('Critical Hit roll 2');
            expect(ran.preview).toContain('Critical Hit roll 5');
            expect(ran.unusedDice).toBe(0);

            expect(ran.card.html).toContain('data-wh40k-system="rt"');
            expect(ran.card.text).toContain('Turret Rating 2 (Chaos Raider Bone Tithe)');
            expect(ran.card.text).toContain('Ordinary (+10)');
            expect(ran.card.text).toContain('4 DoS = ⌊45 ÷ 10⌋ (roll 15 vs target 60)');
            expect(ran.card.text).toContain('0 DoS = ⌊5 ÷ 10⌋ (roll 45 vs target 50)');
            expect(ran.card.text).toContain('Critical Hit rolls: 2 and 5.');
            expect(ran.card.text).toContain('Inflicted: Critical Hit roll 5.');
            expect(ran.card.text).toContain('Hull Integrity damage (1 per degree won by)');
            // #663: the counts read as plurals, not "degree(s)".
            expect(ran.card.text).toContain('The raiders win by 4 degrees and cause mayhem.');
            expect(ran.card.text).toContain('4 degrees won by');
            expect(ran.card.text).not.toContain('(s)');

            // 4 Hull (and on an RT hull 4 Crew and 4 Morale), plus the chosen Critical Hit as a ship status.
            expect(await readShip(page, target.id)).toMatchObject({ hull: 24, population: 51, morale: 56, statuses: 1 });
            const critIds = (await messagesSince(page, before)).filter((id) => id !== ran.card.id);
            expect(critIds, 'the Critical Hit posts its own card').toHaveLength(1);
            // #187: the roll of 5 draws Table 8-12's "Fire!" from the RT core roll tables — not the
            // "roll table unavailable" fallback the old pack/name lookup always hit.
            const crit = await readCard(page, critIds[0] ?? '');
            expect(crit.text).toContain('Fire!');
            expect(crit.text).not.toContain('unavailable');
            expect(await snapChatCard(page, 'ship-hit-and-run-critical-card', critIds[0] ?? '')).not.toBeNull();
            expect(await snapShipVitals(page, target.id, 'ship-hit-and-run-target-after')).toEqual({ hull: '24', morale: '56', population: '51' });
            // #187: the target's Stats tab lists the Critical Hit it now carries.
            expect((await snapDamageControl(page, target.id, 'ship-hit-and-run-target-damage-control')).criticals).toEqual(['Fire!']);
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [raider.id, target.id]);
        }
        recordCoverage('ship-assault.flow', 'hit-and-run');
    });

    test('a boarding craft that fails its approach by four degrees is shot down', async ({ page }) => {
        await joinShipWorld(page);
        const raider = await createShip(page, RAIDER);
        const target = await createShip(page, BONE_TITHE);
        const before = await chatMessageIds(page);
        try {
            // Approach target 30, rolls 95: six degrees of failure. No Command Test is rolled.
            const ran = await runAssaultFromSheet(page, raider.id, {
                tab: 'extendedActions',
                assault: 'hit-and-run',
                label: 'ship-hit-and-run-shot-down',
                defender: BONE_TITHE.name,
                inputs: { pilotSkill: 50 },
                choices: {},
                faces: [95],
            });
            expect(ran.unusedDice).toBe(0);
            expect(ran.card.text).toContain('the boarding craft is shot down');
            expect(await readShip(page, target.id)).toMatchObject({ hull: 28, statuses: 0 });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [raider.id, target.id]);
        }
        recordCoverage('ship-assault.flow', 'hit-and-run-shot-down');
    });

    test('a craft that fails its approach by three RT degrees turns back instead of being shot down', async ({ page }) => {
        await joinShipWorld(page);
        const raider = await createShip(page, RAIDER);
        const target = await createShip(page, BONE_TITHE);
        const before = await chatMessageIds(page);
        try {
            // Approach target 30, rolls 65: a 35-point margin is three degrees of failure under RT's count
            // (RT Core p.232). The +1 count called it four and shot the craft down (p.219: "four or more").
            const ran = await runAssaultFromSheet(page, raider.id, {
                tab: 'extendedActions',
                assault: 'hit-and-run',
                label: 'ship-hit-and-run-turned-back',
                defender: BONE_TITHE.name,
                inputs: { pilotSkill: 50 },
                choices: {},
                faces: [65],
            });
            expect(ran.unusedDice).toBe(0);
            expect(ran.card.text).toContain('Failure — 3 DoF');
            expect(ran.card.text).toContain('3 DoF = ⌊35 ÷ 10⌋ (roll 65 vs target 30)');
            expect(ran.card.text).toContain('The boarding craft is forced to return to its ship.');
            expect(ran.card.text).not.toContain('shot down');
            expect(await readShip(page, target.id)).toMatchObject({ hull: 28, statuses: 0 });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [raider.id, target.id]);
        }
        recordCoverage('ship-assault.flow', 'hit-and-run-turned-back');
    });
});
