import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { expect, test } from './lib/test';
import {
    chatMessageIds,
    createShip,
    joinShipWorld,
    deleteActors,
    deleteMessages,
    fireWeaponFromSheet,
    messagesSince,
    openSheet,
    provenanceRows,
    readShip,
    RT_FRIGATE,
    rollShipActionFromSheet,
    showTab,
    snapChatCard,
    snapWindow,
    type ShipActionTab,
    type ShipFixture,
} from './ship-sheet-driver';

/**
 * Tier B coverage of the Rogue Trader ship actions on the voidcraft sheet
 * (#186, #189 — RT Core pp.212–218), driven the way a GM plays them: the
 * Extended Actions and Manoeuvres tabs list the line's `order` items, an action
 * with an authored effect carries a Roll button, the dialog takes the acting
 * character's skill and any choice, and Roll posts the card and applies the
 * effect to the ship. Effects are then seen where they act: the tabs' "Ship
 * Actions in Effect" list, a later Combined Skill Test's ship-stat split, and
 * the Ballistic Skill rows of a weapon fired from the Weapons tab.
 *
 * Hold Fast! and Triage, which reduce the previous turn's damage, are covered
 * by starship-crew-morale.spec.ts. Dice are queued per roll (see the driver).
 */

const LANCE = { name: 'Titanforge Lance', weaponType: 'lance', location: 'dorsal', strength: 1, damage: '1d10', crit: 3, range: 6 } as const;
const MACROBATTERY = { name: 'Sunsear Laser Battery', weaponType: 'macrobattery', location: 'prow', strength: 2, damage: '1d10', crit: 4, range: 6 } as const;

const SHIP: ShipFixture = { ...RT_FRIGATE, name: 'Ship Actions Frigate', crewRating: 40, weapons: [LANCE, MACROBATTERY] };

/** The ship the Weapons tab fires at (#184): no void shields, Armour 18. */
const TARGET: ShipFixture = { ...RT_FRIGATE, name: 'Ship Actions Target' };

/** Text of the hoverable modifier rows in a weapon card's Ballistic Skill Test section. */
async function gunneryRows(page: Page, html: string): Promise<string[]> {
    return page.evaluate((content: string) => {
        const parsed = document.createElement('div');
        parsed.innerHTML = content;
        const section = parsed.querySelector('[data-wh40k-hook="ship-assault-test"]');
        return [...(section?.querySelectorAll('[data-wh40k-tooltip="modifier"]') ?? [])].map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
    }, html);
}

/** Roll-button and assault-button labels of one action tab. */
async function tabButtons(page: Page, section: string): Promise<{ rollable: string[]; dispatch: number; assaults: string[] }> {
    const rollable = await page
        .locator(`${section} [data-action="rollShipAction"]`)
        .evaluateAll((buttons) => buttons.map((button) => button.closest('li')?.querySelector('span')?.textContent.trim() ?? ''));
    const dispatch = await page.locator(`${section} [data-action^="dispatch"]`).count();
    const assaults = await page
        .locator(`${section} [data-action="openShipAssault"]`)
        .evaluateAll((buttons) => buttons.map((button) => (button instanceof HTMLElement ? button.dataset['assault'] ?? '' : '')));
    return { rollable, dispatch, assaults };
}

/** Open a ship's sheet on an action tab and snap the whole window. */
async function snapActionTab(page: Page, actorId: string, tab: ShipActionTab, label: string): Promise<{ html: string; text: string }> {
    const sheetId = await openSheet(page, actorId);
    const section = await showTab(page, sheetId, tab);
    const html = await page.locator(section).innerHTML();
    const text = ((await page.locator(section).textContent()) ?? '').replace(/\s+/gu, ' ');
    expect(await snapWindow(page, label, sheetId), `${label} screenshot`).not.toBeNull();
    return { html, text };
}

/** One action row's icon as the browser loaded it. */
interface RowIcon {
    name: string;
    src: string;
    loaded: boolean;
}

/** Every action row of a tab and its icon, once the browser has settled every image. */
async function rowIcons(page: Page, section: string): Promise<RowIcon[]> {
    const rows = page.locator(`${section} li[data-action-uuid]`);
    await page.waitForFunction(
        (selector: string) => [...document.querySelectorAll<HTMLImageElement>(`${selector} li[data-action-uuid] img`)].every((img) => img.complete),
        section,
    );
    return rows.evaluateAll((items) =>
        items.map((item) => {
            const img = item.querySelector('img');
            return {
                name: item.querySelector('span')?.textContent.trim() ?? '',
                src: img?.getAttribute('src') ?? '',
                loaded: img !== null && img.complete && img.naturalWidth > 0,
            };
        }),
    );
}

/** The game-icons CDN the pack art is hotlinked from (`scripts/pack-icon-map.json` `cdn`). */
const GAME_ICONS_CDN = 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/';

test.describe.serial('RT ship actions from the voidcraft sheet (Tier B · #186, #189)', () => {
    test('every Extended and Manoeuvre action row shows a loaded game-icons image, not a broken one (#186)', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, SHIP);
        try {
            const sheetId = await openSheet(page, ship.id);
            for (const [tab, label] of [
                ['extendedActions', 'ship-actions-extended-icons'],
                ['manoeuvreActions', 'ship-actions-manoeuvre-icons'],
            ] as const) {
                const section = await showTab(page, sheetId, tab);
                const icons = await rowIcons(page, section);
                expect(icons.length, `${tab} lists actions`).toBeGreaterThan(0);
                // The removed _vendored-ui art rendered every row as a broken image (#625 repointed the packs).
                expect(
                    icons.filter((icon) => !icon.loaded).map((icon) => `${icon.name} → ${icon.src}`),
                    `${tab}: broken icons`,
                ).toEqual([]);
                expect(icons.filter((icon) => !icon.src.startsWith(GAME_ICONS_CDN)).map((icon) => `${icon.name} → ${icon.src}`)).toEqual([]);
                expect(await snapWindow(page, label, sheetId, `${section} .wh40k-panel:has(li[data-action-uuid])`)).not.toBeNull();
            }
        } finally {
            await deleteActors(page, [ship.id]);
        }
        recordCoverage('ship-action.flow', 'row-icons');
    });

    test('both action tabs list the line orders, with Roll on each automated one; another line gets none', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, SHIP);
        const dh2 = await createShip(page, { ...SHIP, name: 'Ship Actions DH2 Hull', gameSystem: 'dh2', weapons: [] });
        try {
            const sheetId = await openSheet(page, ship.id);

            const extended = await showTab(page, sheetId, 'extendedActions');
            const extendedButtons = await tabButtons(page, extended);
            expect(extendedButtons.rollable).toEqual(['Aid the Machine Spirit', 'Flank Speed', 'Hold Fast!', 'Lock on Target', 'Triage']);
            expect(extendedButtons.dispatch, 'every RAW Extended Action keeps its rules card').toBe(14);
            expect(extendedButtons.assaults).toEqual(['hit-and-run']);
            // #701: Hit and Run is one row carrying both its resolver and its rules card, not two entries.
            const hitAndRunRows = page.locator(`${extended} li`).filter({ hasText: /^\s*Hit and Run/iu });
            await expect(hitAndRunRows).toHaveCount(1);
            await expect(hitAndRunRows.locator('[data-action="openShipAssault"][data-assault="hit-and-run"]')).toHaveCount(1);
            await expect(hitAndRunRows.locator('[data-action^="dispatch"]')).toHaveCount(1);
            await expect(page.locator(`${extended} [data-wh40k-hook="ship-assault-panel"]`)).toHaveCount(0);
            expect(await snapWindow(page, 'ship-actions-extended-tab', sheetId)).not.toBeNull();
            // #186: the tab's intro paragraph meets WCAG AA on the dark sheet body (it was dim brown at 80%).
            const extendedIntro = `${extended} [data-wh40k-hook="ship-action-tab-description"]`;
            expect(await scanContrast(page, extendedIntro)).toEqual([]);
            // #260: the action rows were a white wash (grey slabs on the dark sheet, "Skill: …" grey on grey).
            expect(await scanContrast(page, `${extended} ul`)).toEqual([]);
            expect(
                await snapWindow(
                    page,
                    'ship-actions-extended-tab-description',
                    sheetId,
                    `${extended} .wh40k-panel:has([data-wh40k-hook="ship-action-tab-description"])`,
                ),
            ).not.toBeNull();

            const manoeuvre = await showTab(page, sheetId, 'manoeuvreActions');
            const manoeuvreButtons = await tabButtons(page, manoeuvre);
            expect(manoeuvreButtons.rollable).toEqual(['Come to New Heading', 'Evasive Manoeuvres']);
            // The 8 RAW manoeuvres plus the line's 4 homebrew ones (All Stop, Burn Retros, Hard Brake, Plot Course Change).
            expect(manoeuvreButtons.dispatch).toBe(12);
            expect(manoeuvreButtons.assaults).toEqual(['ram', 'board', 'boarding-round']);
            expect(await snapWindow(page, 'ship-actions-manoeuvre-tab', sheetId)).not.toBeNull();
            expect(await scanContrast(page, `${manoeuvre} [data-wh40k-hook="ship-action-tab-description"]`)).toEqual([]);
            expect(await scanContrast(page, `${manoeuvre} ul`)).toEqual([]);

            // The actions and assaults are Rogue Trader rules: a DH2 hull's tabs offer neither.
            const dh2Tab = await snapActionTab(page, dh2.id, 'extendedActions', 'ship-actions-extended-tab-dh2');
            expect(dh2Tab.html).not.toContain('data-action="rollShipAction"');
            expect(dh2Tab.html).not.toContain('data-wh40k-hook="ship-assault-panel"');
            // #699: with none to list, the tab says so plainly; it read like a loading failure.
            expect(dh2Tab.text).toContain("This ship has no Extended Actions. Its line's compendiums list none, and none are on the ship.");
            expect(dh2Tab.text).not.toContain('may not yet be loaded');
        } finally {
            await deleteActors(page, [ship.id, dh2.id]);
        }
        recordCoverage('ship-action.flow', 'action-lists');
    });

    test('Aid the Machine Spirit raises Detection, which Lock on Target counts; Lock on Target reaches only its weapon', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, SHIP);
        const target = await createShip(page, TARGET);
        const before = await chatMessageIds(page);
        try {
            // Tech-Use 50, roll 30: a success by 2 extra degrees, +5 per 2 → +10 Detection.
            const aid = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Aid the Machine Spirit',
                label: 'ship-action-aid-the-machine-spirit',
                skill: 50,
                choices: { target: 'Detection' },
                faces: [30],
            });
            expect(aid.dialogTitle).toBe('Aid the Machine Spirit');
            expect(aid.dialogOptions['target']).toEqual(['Manoeuvrability', 'Detection']);
            expect(aid.unusedDice).toBe(0);
            expect(aid.card.html).toContain('data-outcome="success"');
            expect(aid.card.text).toContain('+10 to Detection, this turn.');
            expect((await readShip(page, ship.id)).modifiers).toEqual([{ name: 'Aid the Machine Spirit', target: 'detection', value: 10, weaponId: '' }]);

            // Scrutiny 40 + Detection 20 + Aid the Machine Spirit 10 = 70, roll 21: 4 extra degrees → +5 +10 = +15.
            const lock = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Lock on Target',
                label: 'ship-action-lock-on-target',
                skill: 40,
                choices: { weapon: MACROBATTERY.name },
                faces: [21],
            });
            // Listed by sheet order, then name: never the embedded collection's iteration order (#186).
            expect(lock.dialogOptions['weapon']).toEqual([MACROBATTERY.name, LANCE.name]);
            expect(lock.unusedDice).toBe(0);
            expect(lock.card.text, 'the Combined Skill Test splits Detection from the live Aid the Machine Spirit bonus').toContain(
                'Detection (Ship Actions Frigate)',
            );
            expect(lock.card.text).toContain('Aid the Machine Spirit');
            expect(provenanceRows(lock.card.html), 'Detection, Aid and the magnitude degree rows').toBeGreaterThanOrEqual(3);
            expect(lock.card.text).toContain(`+15 to Ballistic Skill Tests to fire ${MACROBATTERY.name}, this turn.`);

            // Fire the locked battery at the target: BS 40 + Lock on Target 15 = 55, roll 20 → 3 degrees,
            // capped at Strength 2; the two 1s (2 damage) do not pass Armour 18.
            const locked = await fireWeaponFromSheet(page, ship.id, { weaponId: ship.weaponIds[1] ?? '', defender: TARGET.name, faces: [20, 1, 1] });
            expect(locked.unusedDice, locked.card.text).toBe(0);
            expect(await gunneryRows(page, locked.card.html)).toEqual(['Lock on Target +15']);
            expect(await snapChatCard(page, 'ship-action-lock-on-target-weapon-fire-card', locked.card.id)).not.toBeNull();

            // The lance was not the locked weapon: its BS test carries no Lock on Target row.
            const other = await fireWeaponFromSheet(page, ship.id, { weaponId: ship.weaponIds[0] ?? '', defender: TARGET.name, faces: [99] });
            expect(await gunneryRows(page, other.card.html)).toEqual([]);
            expect(await snapChatCard(page, 'ship-action-unlocked-weapon-fire-card', other.card.id)).not.toBeNull();

            // The sheet lists both live effects on the action tabs.
            const after = await snapActionTab(page, ship.id, 'extendedActions', 'ship-actions-in-effect-extended-tab');
            expect(after.html).toContain('data-wh40k-hook="ship-action-modifiers"');
            expect(after.text).toContain('Lock on Target Ballistic Skill Tests to fire Sunsear Laser Battery +15');
            expect(after.text).toContain('Aid the Machine Spirit Detection +10');
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [ship.id, target.id]);
        }
        recordCoverage('ship-action.flow', 'aid-the-machine-spirit');
        recordCoverage('ship-action.flow', 'lock-on-target');
    });

    test('Flank Speed adds Speed on a success and nothing on a failure', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, SHIP);
        const before = await chatMessageIds(page);
        try {
            // Tech-Use 50, roll 30: 2 extra degrees → 1 + 2 = +3 Speed.
            const flank = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Flank Speed',
                label: 'ship-action-flank-speed',
                skill: 50,
                faces: [30],
            });
            expect(flank.dialogOptions, 'a single-target action offers no choice').toEqual({});
            expect(flank.card.text).toContain('+3 to Speed (VU), this turn.');

            const failed = await rollShipActionFromSheet(page, ship.id, {
                tab: 'extendedActions',
                action: 'Flank Speed',
                label: 'ship-action-flank-speed-failed',
                skill: 50,
                faces: [95],
            });
            expect(failed.card.html).toContain('data-outcome="failure"');
            expect(failed.card.text).toContain('The test fails. The action has no effect.');
            expect((await readShip(page, ship.id)).modifiers.map((m) => m.value)).toEqual([3]);
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [ship.id]);
        }
        recordCoverage('ship-action.flow', 'flank-speed');
    });

    test('Come to New Heading and Evasive Manoeuvres put their penalties on every weapon', async ({ page }) => {
        await joinShipWorld(page);
        const ship = await createShip(page, { ...SHIP, crewRating: 60 });
        const target = await createShip(page, TARGET);
        const before = await chatMessageIds(page);
        try {
            // Pilot 40 + Manoeuvrability 15 − 10 = 45, roll 30: Come to New Heading's flat −20.
            const heading = await rollShipActionFromSheet(page, ship.id, {
                tab: 'manoeuvreActions',
                action: 'Come to New Heading',
                label: 'ship-action-come-to-new-heading',
                skill: 40,
                faces: [30],
            });
            expect(heading.card.text).toContain('Manoeuvrability (Ship Actions Frigate)');
            expect(heading.card.text).toContain("-20 to every Ballistic Skill Test to fire the ship's weapons, this turn.");

            // Roll 34: 1 extra degree → −10 −10 = −20, until the ship's next turn.
            const evasive = await rollShipActionFromSheet(page, ship.id, {
                tab: 'manoeuvreActions',
                action: 'Evasive Manoeuvres',
                label: 'ship-action-evasive-manoeuvres',
                skill: 40,
                faces: [34],
            });
            expect(evasive.card.text).toContain("-20 to every Ballistic Skill Test to fire the ship's weapons, until the start of the ship's next turn.");
            // #186: the negative step is signed once ("+-10 per 1" before), and at chat width no
            // breakdown value wraps under its label ("4 / 0" before).
            expect(evasive.card.text).toContain('Extra degrees of success: 1 (-10 per 1)');
            expect(evasive.card.text).not.toContain('+-');
            const wrappedValues = await page.evaluate((id) => {
                const values = document.querySelectorAll<HTMLElement>(`#sidebar .chat-log .message[data-message-id="${id}"] [data-breakdown-value]`);
                return [...values]
                    .filter((value) => value.getBoundingClientRect().height > parseFloat(getComputedStyle(value).lineHeight) * 1.5)
                    .map((value) => value.textContent.trim());
            }, evasive.card.id);
            expect(wrappedValues).toEqual([]);
            // The base values were dark text on the void panel until the card declared its dark surface.
            expect(await scanContrast(page, `#sidebar .chat-log .message[data-message-id="${evasive.card.id}"] [data-wh40k-hook="ship-action-roll"]`)).toEqual(
                [],
            );

            // BS 60 − 20 − 20 = 20, roll 5 → 1 degree, 2 hits; the two 1s do not pass Armour. Both penalties are named rows.
            const fired = await fireWeaponFromSheet(page, ship.id, { weaponId: ship.weaponIds[1] ?? '', defender: TARGET.name, faces: [5, 1, 1] });
            expect(fired.unusedDice, fired.card.text).toBe(0);
            expect(await gunneryRows(page, fired.card.html)).toEqual(['Come to New Heading -20', 'Evasive Manoeuvres -20']);
            expect(await snapChatCard(page, 'ship-action-manoeuvre-penalties-weapon-fire-card', fired.card.id)).not.toBeNull();

            const after = await snapActionTab(page, ship.id, 'manoeuvreActions', 'ship-actions-in-effect-manoeuvre-tab');
            expect(after.text).toContain("Come to New Heading every Ballistic Skill Test to fire the ship's weapons -20");
            expect(after.text).toContain("Evasive Manoeuvres every Ballistic Skill Test to fire the ship's weapons -20");
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [ship.id, target.id]);
        }
        recordCoverage('ship-action.flow', 'come-to-new-heading');
        recordCoverage('ship-action.flow', 'evasive-manoeuvres');
    });
});
