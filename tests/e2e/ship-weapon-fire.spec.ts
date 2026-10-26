import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { expect, test } from './lib/test';
import {
    chatMessageIds,
    createShip,
    deleteActors,
    deleteMessages,
    fireWeaponFromSheet,
    joinShipWorld,
    messagesSince,
    openSheet,
    provenanceRows,
    readCard,
    readHullCondition,
    readShieldsUp,
    readShip,
    RT_FRIGATE,
    setHull,
    setVoidShields,
    showTab,
    snapDamageControl,
    snapShipVitals,
    snapWindow,
    type ShipFixture,
} from './ship-sheet-driver';

/**
 * Tier B coverage of RT ship weapon fire (#184 — RT Core 1.4 errata, Chapter
 * VIII), driven from the voidcraft sheet the way a GM plays it: the Weapons
 * tab's Fire control opens the Fire dialog, the GM picks the target ship and
 * the range, Roll previews the shot, and Apply lands it — on the TARGET. The
 * shots replay the book's own worked example (the Sabre against a raider with
 * one void shield and Armour 15):
 *
 * - macrobattery: BS 48 at close range (+10) = 58, roll 29 → two degrees,
 *   three hits; the shield takes one; 9 + 7 = 16 against Armour 15 → 1 Hull.
 * - lance: roll 11 → four degrees, enough for Crit Rating 4; the shield is
 *   down, Armour is ignored, 1d10+4 = 9 Hull; the 1d5 Critical Hit is a 5,
 *   which the RT core table draws as "Fire!" (#187).
 *
 * Dice are queued per shot (see the driver). Every state is snapped: the
 * target's vitals and Damage Control before and after, the Weapons tab, the
 * dialog, the resolved preview and the card.
 */

const MACROBATTERY = { name: 'Sabre Macrobattery', weaponType: 'macrobattery', location: 'port', strength: 3, damage: '1d10', crit: 4, range: 6 } as const;
const LANCE = { name: 'Sabre Lance', weaponType: 'lance', location: 'dorsal', strength: 1, damage: '1d10+4', crit: 4, range: 6 } as const;
const BROADSIDE = { name: 'Sabre Broadside', weaponType: 'macrobattery', location: 'starboard', strength: 4, damage: '2d10', crit: 4, range: 6 } as const;

const SABRE: ShipFixture = { ...RT_FRIGATE, name: 'Sabre', crewRating: 48, weapons: [MACROBATTERY, LANCE] };
const RAIDER: ShipFixture = { ...RT_FRIGATE, name: 'Fire Target Raider', hullType: 'raider', armour: 15, hullIntegrity: 30, population: 60, morale: 50 };

/** Open a Weapon Component's item sheet and return its application id. */
async function openWeaponSheet(page: Page, actorId: string, itemId: string): Promise<string> {
    const appId = await page.evaluate(
        async ({ actor, item }) => {
            interface SheetApp {
                id: string;
                render: (options: { force: boolean }) => Promise<object>;
                setPosition: (position: object) => void;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { items: { get: (i: string) => { sheet: SheetApp | null } | undefined } } | undefined } };
            };
            const sheet = g.game.actors.get(actor)?.items.get(item)?.sheet ?? null;
            if (sheet === null) throw new Error(`no sheet for item ${item}`);
            await sheet.render({ force: true });
            sheet.setPosition({ left: 16, top: 8, width: 600, height: 860 });
            return sheet.id;
        },
        { actor: actorId, item: itemId },
    );
    await page.locator(`#${appId}`).waitFor({ state: 'visible' });
    return appId;
}

test.describe.serial('RT ship weapon fire from the voidcraft sheet (Tier B · #184, #187)', () => {
    test("the book's macrobattery shot lands on the target ship, through its void shield and Armour", async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const raider = await createShip(page, RAIDER);
        await setVoidShields(page, raider.id, 1);
        const before = await chatMessageIds(page);
        try {
            expect(await snapShipVitals(page, raider.id, 'ship-weapon-fire-macro-target-before')).toEqual({ hull: '30', morale: '50', population: '60' });
            expect(await snapDamageControl(page, raider.id, 'ship-weapon-fire-macro-target-shields-before')).toEqual({ shields: '1 / 1', criticals: [] });

            const fired = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[0] ?? '',
                defender: RAIDER.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                faces: [29, 9, 7],
                label: 'ship-weapon-fire-macro',
            });
            expect(fired.dialogTitle).toBe('Fire Ship Weapon');
            expect(fired.targets).toContain(RAIDER.name);
            expect(fired.targets, 'a ship never targets itself').not.toContain(SABRE.name);
            expect(fired.unusedDice).toBe(0);
            expect(fired.preview).toContain('Hits on Fire Target Raider');

            const { text, html } = fired.card;
            expect(text).toContain('Sabre → Fire Target Raider');
            expect(text).toContain('Within half range (6 VU weapon) +10');
            expect(text).toContain('Success — 2 DoS');
            expect(text).toContain('2 DoS: +1 hit each 2');
            expect(text).toContain('Void shields (Fire Target Raider, 1 up) -1');
            expect(text).toContain('Armour (Fire Target Raider, 15) -15');
            // Range, base hit, degree hits, shield, two damage rolls, Armour — each hoverable to its rule.
            expect(provenanceRows(html)).toBe(7);
            expect(await scanContrast(page, `#sidebar .chat-log .message[data-message-id="${fired.card.id}"] [data-wh40k-hook="ship-weapon-card"]`)).toEqual(
                [],
            );

            // 1 Hull off the TARGET (and on an RT hull 1 Crew and 1 Morale); its one shield overloaded.
            expect(await readShip(page, raider.id)).toMatchObject({ hull: 29, population: 59, morale: 49 });
            expect(await readShieldsUp(page, raider.id)).toBe(0);
            // The regression: the firing ship took the hit itself.
            expect(await readShip(page, sabre.id)).toMatchObject({ hull: SABRE.hullIntegrity, population: SABRE.population, morale: SABRE.morale });

            expect(await snapShipVitals(page, raider.id, 'ship-weapon-fire-macro-target-after')).toEqual({ hull: '29', morale: '49', population: '59' });
            expect((await snapDamageControl(page, raider.id, 'ship-weapon-fire-macro-target-shields-after')).shields).toBe('0 / 1');
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, raider.id]);
        }
        recordCoverage('ship-weapon.flow', 'macrobattery');
    });

    test('a Crippled ship (0 Hull Integrity) fires its macrobattery at half Strength, named on the card (#187)', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const raider = await createShip(page, RAIDER);
        await setVoidShields(page, raider.id, 1);
        const before = await chatMessageIds(page);
        try {
            // RT Core "Crippled Ships": Crippled is 0 Hull Integrity — half Hull is only damaged.
            await setHull(page, sabre.id, 17);
            expect((await readHullCondition(page, sabre.id)).crippled, 'half Hull is not Crippled').toBe(false);
            await setHull(page, sabre.id, 0);
            expect(await readHullCondition(page, sabre.id)).toEqual({ crippled: true, destroyed: false });

            // The book's shot: 3 hits, but a Crippled Strength 3 battery lands 2; the shield takes one; 9 vs Armour 15.
            const fired = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[0] ?? '',
                defender: RAIDER.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                faces: [29, 9],
                label: 'ship-weapon-fire-crippled',
            });
            expect(fired.unusedDice).toBe(0);
            expect(fired.preview).toContain('Crippled: Strength halved (3 → 2) -1');
            expect(fired.card.text).toContain('Crippled: Strength halved (3 → 2) -1');
            expect(fired.card.text).toContain('Hit 1 (1d10) 9');
            expect(fired.card.text).not.toContain('Hit 2 (1d10)');
            expect(await readShip(page, raider.id)).toMatchObject({ hull: 30 });
            expect(await readShieldsUp(page, raider.id)).toBe(0);
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, raider.id]);
        }
        recordCoverage('ship-weapon.flow', 'crippled-half-strength');
    });

    test('two macrobatteries combined into one salvo: own tests, pooled hits, one Armour subtraction (#184)', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, { ...SABRE, weapons: [MACROBATTERY, LANCE, BROADSIDE] });
        const raider = await createShip(page, RAIDER);
        await setVoidShields(page, raider.id, 1);
        const before = await chatMessageIds(page);
        const [macroId = '', lanceId = '', broadsideId = ''] = sabre.weaponIds;
        try {
            // RT Core p.221: each battery tests on its own. The port battery: 48 + 10 (close) = 58, roll 29 → 3 hits.
            // The broadside: 48 at standard range, roll 30 → 1 degree, 2 hits. The raider's shield discards one of
            // the cheaper port hits (p.222, the attacker's choice). 9 + 7 + (6+6) + (5+5) = 38, less Armour 15 ONCE = 23.
            // Fired one at a time, 16 and 22 would each lose 15 to Armour: 1 + 7 = 8.
            const fired = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: macroId,
                defender: RAIDER.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                salvo: [{ weaponId: broadsideId, rangeBand: 'standard' }],
                faces: [29, 30, 9, 7, 6, 6, 5, 5],
                label: 'ship-weapon-fire-salvo',
            });
            expect(fired.inputNames).toEqual(expect.arrayContaining([`salvo-${broadsideId}`, `salvoRange-${broadsideId}`, 'shieldsFirst']));
            expect(fired.inputNames, 'a lance is never combined').not.toContain(`salvo-${lanceId}`);
            expect(fired.unusedDice).toBe(0);

            const { text, html } = fired.card;
            expect(text).toContain('Combined salvo of 2 macrobatteries');
            expect(text).toContain('Sabre Macrobattery: Ballistic Skill Test');
            expect(text).toContain('Sabre Broadside: Ballistic Skill Test');
            expect(text).toContain("Void shields (Fire Target Raider) take Sabre Macrobattery's hits -1");
            expect(text).toContain('Hit 3: Sabre Broadside (2d10) 12');
            expect(text.split('Armour (Fire Target Raider, 15) -15').length - 1, 'Armour is subtracted once').toBe(1);
            expect(html.split('data-wh40k-hook="ship-assault-test"').length - 1, 'one test per battery').toBe(2);

            expect(await readShip(page, raider.id)).toMatchObject({ hull: 7, population: 37, morale: 27 });
            expect(await readShieldsUp(page, raider.id)).toBe(0);
            expect(await snapShipVitals(page, raider.id, 'ship-weapon-fire-salvo-target-after')).toEqual({ hull: '7', morale: '27', population: '37' });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, raider.id]);
        }
        recordCoverage('ship-weapon.flow', 'macrobattery-salvo');
    });

    test("the book's lance shot ignores Armour and its Critical Hit draws Table 8-12", async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const raider = await createShip(page, RAIDER);
        const before = await chatMessageIds(page);
        try {
            expect(await snapShipVitals(page, raider.id, 'ship-weapon-fire-lance-target-before')).toEqual({ hull: '30', morale: '50', population: '60' });
            const fired = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[1] ?? '',
                defender: RAIDER.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                faces: [11, 5, 5],
                label: 'ship-weapon-fire-lance',
            });
            expect(fired.unusedDice).toBe(0);
            expect(fired.card.text).toContain('Success — 4 DoS');
            expect(fired.card.text).toContain('Lance ignores Armour (Fire Target Raider, 15) 0');
            expect(fired.card.text).toContain('Critical Hit! Rolled 5 on 1d5 against Fire Target Raider.');

            expect(await readShip(page, raider.id)).toMatchObject({ hull: 21, population: 51, morale: 41, statuses: 1 });
            const critIds = (await messagesSince(page, before)).filter((id) => id !== fired.card.id);
            expect(critIds, 'the Critical Hit posts its own card').toHaveLength(1);
            const crit = await readCard(page, critIds[0] ?? '');
            expect(crit.text).toContain('Fire!');
            expect(crit.text).not.toContain('unavailable');

            expect(await snapShipVitals(page, raider.id, 'ship-weapon-fire-lance-target-after')).toEqual({ hull: '21', morale: '41', population: '51' });
            expect((await snapDamageControl(page, raider.id, 'ship-weapon-fire-lance-target-criticals')).criticals).toEqual(['Fire!']);
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, raider.id]);
        }
        recordCoverage('ship-weapon.flow', 'lance-critical');
    });

    test('a miss posts the card and leaves the target untouched', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const raider = await createShip(page, RAIDER);
        const before = await chatMessageIds(page);
        try {
            const fired = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[0] ?? '',
                defender: RAIDER.name,
                rangeBand: 'long',
                faces: [96],
                label: 'ship-weapon-fire-miss',
            });
            expect(fired.unusedDice).toBe(0);
            // #698: the −10 row names its band, Long range, as the dialog does.
            expect(fired.card.text).toContain('Long range (beyond 6 VU weapon) -10');
            expect(fired.card.text).not.toContain('Beyond range');
            expect(fired.card.text).toContain('The shot misses. No hits reach Fire Target Raider.');
            expect(await readShip(page, raider.id)).toMatchObject({ hull: 30, statuses: 0 });
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, raider.id]);
        }
        recordCoverage('ship-weapon.flow', 'miss');
    });

    test('another line’s ship has no RT fire rules: Fire warns and opens no dialog', async ({ page }) => {
        await joinShipWorld(page);
        const dh2 = await createShip(page, { ...SABRE, name: 'Fire DH2 Hull', gameSystem: 'dh2' });
        try {
            const sheetId = await openSheet(page, dh2.id);
            const section = await showTab(page, sheetId, 'weapons');
            await page.locator(`${section} [data-action="fireShipWeapon"][data-item-id="${dh2.weaponIds[0] ?? ''}"]`).click();
            await expect(page.locator('#notifications .notification', { hasText: 'Rogue Trader starship rules' })).toBeVisible();
            await expect(page.locator('.application.ship-assault-dialog')).toHaveCount(0);
        } finally {
            await deleteActors(page, [dh2.id]);
        }
        recordCoverage('ship-weapon.flow', 'other-line-gated');
    });

    test('the Weapon Component item sheet shows localized labels, not raw keys', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        try {
            const appId = await openWeaponSheet(page, sabre.id, sabre.weaponIds[0] ?? '');
            const labels = await page.locator(`#${appId} label, #${appId} h3`).allTextContents();
            const shown = labels.map((label) => label.trim());
            expect(shown.filter((label) => label.startsWith('WH40K.'))).toEqual([]);
            expect(shown).toEqual(expect.arrayContaining(['Weapon Type', 'Location', 'Hull Types']));
            expect(await snapWindow(page, 'ship-weapon-item-sheet', appId)).not.toBeNull();
        } finally {
            await deleteActors(page, [sabre.id]);
        }
        recordCoverage('ship-weapon.flow', 'item-sheet-labels');
    });
});
