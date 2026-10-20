import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, readActorSystem, showSheetTab, snapElement } from './occult-sheet-flow';

/**
 * Tier B for #688: an origin's flat wound bonus has one home,
 * `modifiers.resources.wounds`.
 *
 * The origin sheet's Wounds field edited `grants.wounds`, a field the schema
 * never had, so it always showed the placeholder. The character's wounds
 * total read `modifiers.wounds`, a path no origin has. So when a rolled
 * wounds formula rebuilt the maximum, every origin's flat bonus was dropped.
 *
 * The first test opens Only War's Agri-World (+2 Wounds, Hammer of the Emperor
 * p.36) and checks its sheet shows the bonus. The second gives an Only War
 * character that homeworld and a Weapon Specialist with a rolled wounds
 * formula. It checks the maximum is the roll plus the +2, and that a world boot
 * (the origin-grant reconcile) does not add it again.
 */

const OW_AGRI_WORLD = 'Compendium.wh40k-rpg.ow-hammer-origins-homeworlds.Item.3422efadd4703be1';
const OW_WEAPON_SPECIALIST = 'Compendium.wh40k-rpg.ow-core-origins-specialities.Item.ea0b23f03e614824';
const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';
const WOUND_BONUS = '[data-wh40k-hook="origin-wounds-bonus"]';
/** The Weapon Specialist's rolled starting wounds: its 8+1d5 with a 3 on the die. */
const ROLLED_WOUNDS = 11;
/** Agri-World's flat wound bonus. */
const AGRI_WORLD_BONUS = 2;

interface ProbeSheet {
    id: string;
    render: (opts: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    fromUuid: (uuid: string) => Promise<{ sheet: ProbeSheet } | null>;
    game: {
        actors: {
            get: (id: string) => { items: { get: (i: string) => { update: (data: object) => Promise<object> } | undefined } } | undefined;
        };
    };
}

/** Record a rolled wounds formula on the actor's embedded origin, as the builder does at commit. */
async function rollWounds(page: Page, actorId: string, itemId: string, rolled: number): Promise<void> {
    await page.evaluate(
        async ({ actor, item, total }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const origin = w.game.actors.get(actor)?.items.get(item);
            if (origin === undefined) throw new Error(`origin ${item} missing`);
            await origin.update({ 'system.rollResults.wounds': { formula: '8+1d5', rolled: total, breakdown: '8 + 3', timestamp: 0 } });
        },
        { actor: actorId, item: itemId, total: rolled },
    );
}

test.describe.serial('Origin wound bonus (Tier B, #688)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test("the origin sheet's Wounds field shows Agri-World's +2", async ({ page }) => {
        const sheetId = await page.evaluate(async (uuid) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const origin = await (globalThis as unknown as ProbeWindow).fromUuid(uuid);
            if (origin === null) throw new Error(`${uuid} not found`);
            await origin.sheet.render({ force: true });
            return origin.sheet.id;
        }, OW_AGRI_WORLD);
        await expect(page.locator(`#${sheetId} ${WOUND_BONUS}`)).toHaveValue(String(AGRI_WORLD_BONUS));
        await snapElement(page, 'origin-wound-bonus-sheet-ow-agri-world', `#${sheetId}`, sheetId);
        await page.evaluate(async (uuid) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (await (globalThis as unknown as ProbeWindow).fromUuid(uuid))?.sheet.close();
        }, OW_AGRI_WORLD);
        recordCoverage('sheet.render', 'originPath.ow.homeWorld.woundBonus');
    });

    test("a rolled wounds formula keeps Agri-World's +2, once", async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, { name: 'Agri Specialist', type: 'ow-character', system: { gameSystem: 'ow' } });
        const [, specialistId] = await addCompendiumItems(page, actorId, [OW_AGRI_WORLD, OW_WEAPON_SPECIALIST]);
        await rollWounds(page, actorId, specialistId, ROLLED_WOUNDS);

        const expected = ROLLED_WOUNDS + AGRI_WORLD_BONUS;
        await expect.poll(async () => readActorSystem(page, actorId, 'wounds.max')).toBe(expected);
        await showSheetTab(page, actorId, 'overview');
        await expect(page.locator(`#${sheetId} ${VITALS}`)).toContainText(`/${expected}`);
        await snapElement(page, 'origin-wound-bonus-character-ow-agri-world', `#${sheetId} ${VITALS}`, sheetId);

        await joinOrSkip(page);
        expect(await readActorSystem(page, actorId, 'wounds.max')).toBe(expected);
        recordCoverage('origin.resources', 'wounds.formula');
    });
});
