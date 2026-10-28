import type { Page } from '@playwright/test';
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
    readCard,
    readHullCondition,
    readShip,
    RT_FRIGATE,
    rollShipActionFromSheet,
    setHull,
    setVoidShields,
    showTab,
    snapDamageControl,
    snapWindow,
    type ShipFixture,
} from './ship-sheet-driver';

/**
 * Tier B coverage of Crippled and destroyed starships (#187 — RT Core 1.4
 * errata p.222 "Crippled Ships", p.221 "Destroying Ships", Table 8-12), driven
 * from the voidcraft sheet:
 *
 * - An RT ship at 0 Hull is Crippled, never destroyed by Hull: the sheet shows
 *   the Crippled condition, and the Build Summary names the −10 Manoeuvrability,
 *   −10 Detection and half Speed as the Crippled rule's own rows.
 * - A Combined Skill Test from a Crippled ship splits the −10 out as its own row.
 * - Damage past a Crippled target's Armour is a Critical Hit, read on the chart
 *   at that damage. A value past the chart lands on Catastrophic Damage, which
 *   the table marks as destroying the ship: only then is it destroyed.
 * - Another line's voidcraft at 0 Hull keeps its old reading and shows no RT
 *   condition.
 */

const MACROBATTERY = { name: 'Sabre Macrobattery', weaponType: 'macrobattery', location: 'port', strength: 3, damage: '1d10', crit: 4, range: 6 } as const;
const LANCE = { name: 'Sabre Lance', weaponType: 'lance', location: 'dorsal', strength: 1, damage: '1d10+4', crit: 4, range: 6 } as const;

const SABRE: ShipFixture = { ...RT_FRIGATE, name: 'Crippled Spec Sabre', crewRating: 48, weapons: [MACROBATTERY, LANCE] };
const WRECK: ShipFixture = { ...RT_FRIGATE, name: 'Crippled Spec Raider', hullType: 'raider', armour: 15, hullIntegrity: 30, population: 60, morale: 50 };

/**
 * The header's vitals column (Hull Integrity, the condition under it, Morale, Crew):
 * the whole header is taller than the sidebar shows, so it is framed on its own.
 */
function vitalsColumn(sheetId: string): string {
    return `#${sheetId} .wh40k-ship-header div.tw-border-l-2`;
}

/** The sheet's condition block under Hull Integrity, and its text. */
async function conditionText(page: Page, sheetId: string): Promise<{ crippled: string; destroyed: string }> {
    const read = async (hook: string): Promise<string> => {
        const el = page.locator(`#${sheetId} [data-wh40k-hook="${hook}"]`);
        return (await el.count()) === 0 ? '' : ((await el.first().textContent()) ?? '').replace(/\s+/gu, ' ').trim();
    };
    return { crippled: await read('ship-condition-crippled'), destroyed: await read('ship-condition-destroyed') };
}

/** Each Build Summary row's total and its Crippled source value. */
async function buildSummary(page: Page, section: string): Promise<Record<string, { total: string; crippled: string }>> {
    return page.locator(`${section} [data-wh40k-hook="ship-build-summary__row"]`).evaluateAll((rows) =>
        Object.fromEntries(
            rows.map((row) => [
                row.getAttribute('data-stat') ?? '',
                {
                    total: row.querySelector('[data-field="total"]')?.textContent.trim() ?? '',
                    crippled: row.querySelector('[data-source-type="crippled"]')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
                },
            ]),
        ),
    );
}

test.describe.serial('Crippled and destroyed RT ships on the voidcraft sheet (Tier B · #187)', () => {
    test('an RT ship at 0 Hull is Crippled, not destroyed, and its stats carry the Crippled rows', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        try {
            await setHull(page, sabre.id, 0);
            expect(await readHullCondition(page, sabre.id)).toEqual({ crippled: true, destroyed: false });

            const sheetId = await openSheet(page, sabre.id);
            const condition = await conditionText(page, sheetId);
            expect(condition.crippled).toContain('Crippled');
            expect(condition.crippled).toContain('weapons at half Strength');
            expect(condition.destroyed, 'a ship at 0 Hull is never destroyed by Hull').toBe('');
            // The callout is one line in the sidebar, with the rule as its tooltip
            // (its paragraph was cut off by the sidebar's scroll region).
            const callout = page.locator(`#${sheetId} [data-wh40k-hook="ship-condition-crippled"]`);
            await expect(callout).toHaveAttribute('data-tooltip', /weapons at half Strength/u);
            expect((await callout.boundingBox())?.height ?? 0).toBeLessThan(40);
            expect(await snapWindow(page, 'ship-crippled-sheet-condition', sheetId, vitalsColumn(sheetId))).not.toBeNull();

            // RT_FRIGATE: Speed 7, Manoeuvrability 15, Detection 20 → 4, 5, 10.
            const section = await showTab(page, sheetId, 'components');
            const rows = await buildSummary(page, section);
            expect(rows['speed']).toEqual({ total: '4', crippled: 'Crippled ship (0 Hull Integrity) (RT Core: Crippled Ships) -3' });
            expect(rows['manoeuvrability']).toEqual({ total: '5', crippled: 'Crippled ship (0 Hull Integrity) (RT Core: Crippled Ships) -10' });
            expect(rows['detection']).toEqual({ total: '10', crippled: 'Crippled ship (0 Hull Integrity) (RT Core: Crippled Ships) -10' });
            await page.locator(`${section} [data-wh40k-hook="ship-build-summary__row"] summary`).evaluateAll((summaries) => {
                for (const summary of summaries) (summary.parentElement as HTMLDetailsElement).open = true;
            });
            expect(await snapWindow(page, 'ship-crippled-build-summary', sheetId, `${section} .wh40k-ship-build-summary-panel`)).not.toBeNull();

            // Back above 0 Hull, the ship is no longer Crippled and the rows go.
            await setHull(page, sabre.id, 1);
            expect(await readHullCondition(page, sabre.id)).toEqual({ crippled: false, destroyed: false });
        } finally {
            await deleteActors(page, [sabre.id]);
        }
        recordCoverage('ship-crippled.flow', 'crippled-condition');
    });

    test('a Combined Skill Test from a Crippled ship names the −10 Detection as its own row', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const before = await chatMessageIds(page);
        try {
            await setHull(page, sabre.id, 0);
            // Lock on Target is a Scrutiny + Detection test: 48 + Detection (20 − 10) = 58, roll 30.
            const rolled = await rollShipActionFromSheet(page, sabre.id, {
                tab: 'extendedActions',
                action: 'Lock on Target',
                label: 'ship-crippled-combined-test',
                skill: 48,
                choices: { weapon: MACROBATTERY.name },
                faces: [30],
            });
            expect(rolled.unusedDice).toBe(0);
            expect(rolled.card.text).toContain('Detection (Crippled Spec Sabre) +20');
            expect(rolled.card.text).toContain('Crippled ship (−10 Detection) -10');
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id]);
        }
        recordCoverage('ship-crippled.flow', 'combined-test-row');
    });

    test('damage past a Crippled target’s Armour is a Critical Hit; only a destroying result destroys it', async ({ page }) => {
        await joinShipWorld(page);
        const sabre = await createShip(page, SABRE);
        const wreck = await createShip(page, WRECK);
        await setVoidShields(page, wreck.id, 1);
        const before = await chatMessageIds(page);
        try {
            await setHull(page, wreck.id, 0);
            expect(await readHullCondition(page, wreck.id)).toEqual({ crippled: true, destroyed: false });

            // The book's macrobattery shot: 16 against Armour 15 is 1 past it — Table 8-12 result 1, Holed.
            const macro = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[0] ?? '',
                defender: WRECK.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                faces: [29, 9, 7],
                label: 'ship-crippled-target-macro',
            });
            expect(macro.unusedDice).toBe(0);
            expect(macro.card.text).toContain('Crippled Spec Raider is Crippled: 1 damage past its Armour is a Critical Hit on Table 8-12.');
            expect(await readShip(page, wreck.id)).toMatchObject({ hull: 0, statuses: 1 });
            expect(await readHullCondition(page, wreck.id)).toEqual({ crippled: true, destroyed: false });
            const holed = (await messagesSince(page, before)).filter((id) => id !== macro.card.id);
            expect(holed).toHaveLength(1);
            const holedCard = await readCard(page, holed[0] ?? '');
            expect(holedCard.text).toContain('Holed');
            expect(holedCard.text).toContain('Crippled: 1 damage past Armour');

            // The lance: roll 11 meets Crit Rating 4 (1d5 → 5, Fire!) and its 14 damage is all past Armour.
            // 14 runs past the chart and lands on Catastrophic Damage, which destroys the ship.
            const afterMacro = await chatMessageIds(page);
            const lance = await fireWeaponFromSheet(page, sabre.id, {
                weaponId: sabre.weaponIds[1] ?? '',
                defender: WRECK.name,
                gunnerSkill: 48,
                rangeBand: 'close',
                faces: [11, 10, 5],
                label: 'ship-crippled-target-lance',
            });
            expect(lance.unusedDice).toBe(0);
            expect(lance.card.text).toContain('Crippled Spec Raider is Crippled: 14 damage past its Armour is a Critical Hit on Table 8-12.');
            const crits = (await messagesSince(page, afterMacro)).filter((id) => id !== lance.card.id);
            expect(crits).toHaveLength(2);
            const texts = await Promise.all(crits.map(async (id) => (await readCard(page, id)).text));
            expect(texts.some((text) => text.includes('Fire!'))).toBe(true);
            const catastrophic = texts.find((text) => text.includes('Catastrophic Damage')) ?? '';
            expect(catastrophic).toContain('Crippled Spec Raider is destroyed.');
            const catastrophicId = crits[texts.indexOf(catastrophic)] ?? '';
            await page.locator(`.chat-log .message[data-message-id="${catastrophicId}"]`).waitFor({ state: 'attached' });

            expect(await readHullCondition(page, wreck.id)).toEqual({ crippled: true, destroyed: true });
            expect((await snapDamageControl(page, wreck.id, 'ship-crippled-target-damage-control')).criticals).toEqual([
                'Holed',
                'Fire!',
                'Catastrophic Damage',
            ]);
            const sheetId = await openSheet(page, wreck.id);
            expect((await conditionText(page, sheetId)).destroyed).toContain('A Critical Hit result destroyed this ship.');
            expect(await snapWindow(page, 'ship-crippled-target-destroyed', sheetId, vitalsColumn(sheetId))).not.toBeNull();
        } finally {
            await deleteMessages(page, await messagesSince(page, before));
            await deleteActors(page, [sabre.id, wreck.id]);
        }
        recordCoverage('ship-crippled.flow', 'crippled-target-critical');
        recordCoverage('ship-crippled.flow', 'destroyed-by-critical');
    });

    test('another line’s voidcraft at 0 Hull keeps its reading and shows no RT condition', async ({ page }) => {
        await joinShipWorld(page);
        const dh2 = await createShip(page, { ...SABRE, name: 'Crippled Spec DH2 Hull', gameSystem: 'dh2' });
        try {
            await setHull(page, dh2.id, 0);
            // The pre-#187 reading for the other lines: 0 Hull is destroyed, and the RT Crippled effects do not apply.
            expect((await readHullCondition(page, dh2.id)).destroyed).toBe(true);
            expect(await readShip(page, dh2.id)).toMatchObject({ hull: 0 });
            const sheetId = await openSheet(page, dh2.id);
            expect(await conditionText(page, sheetId)).toEqual({ crippled: '', destroyed: '' });
            expect(await snapWindow(page, 'ship-crippled-other-line', sheetId, vitalsColumn(sheetId))).not.toBeNull();
        } finally {
            await deleteActors(page, [dh2.id]);
        }
        recordCoverage('ship-crippled.flow', 'other-line-unchanged');
    });
});
