import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { emptyContentSections, shownContentSections } from './content-sections';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of Deathwatch Distinctions and special abilities (#171, #597)
 * on real Foundry, driven through the Battle-Brother's sheet:
 *
 *   1. Dropping an Advanced Special Ability below its Renown rank is refused with
 *      a notice and nothing is added.
 *   2. Dropping it at the rank is accepted, and dropping a Distinction that carries
 *      a Renown reward pays the reward.
 *   3. The special ability's own sheet (opened from the panel) edits its Renown
 *      fields, and the panel follows.
 *   4. A character saved with the retired Distinction id lists loads with those
 *      entries as owned special abilities.
 *
 * Drops are real DOM `drop` events carrying Foundry's drag payload, so they go
 * through the sheet's own drop handling. The Advanced Special Ability is the
 * compendium's Command and Control (Famed); the rewarding Distinction is a world
 * fixture built in the spec.
 */

const ACTOR_NAME = 'e2e-dw-distinction-brother';
const PANEL = '[data-wh40k-hook="dw-distinction-entry"]';
const PANEL_ROOT = '.wh40k-dw-distinction-panel';
const COMMAND_AND_CONTROL = compendiumUuid({ line: 'dw', category: 'special-abilities' }, 'd3ca0b695ce56753');
const REWARD_FIXTURE = 'e2e Fixture Distinction';
const FREEFORM_SETTING = 'freeform-characters';
const SCREENSHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');

interface ProbeItem {
    id: string;
    uuid: string;
    name: string;
    system: { cost: number; renownReward: number; category: string };
    sheet: { id: string; close: () => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeActor {
    id: string;
    system: { renown: number };
    items: { contents: ProbeItem[]; getName: (name: string) => ProbeItem | undefined };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<object[]>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        items: { getName: (name: string) => ProbeItem | undefined };
        settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, value: boolean) => Promise<boolean> };
    };
}

/** Create the Battle-Brother and open his sheet on the Overview tab; returns the sheet's app id. */
async function openBrother(page: Page, system: object): Promise<string> {
    const sheetId = await page.evaluate(
        async ({ name, sys }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (Actor, game) have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            const actor = await w.Actor.create({ name, type: 'dw-character', system: { gameSystem: 'dw', ...sys } });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return actor.sheet.id;
        },
        { name: ACTOR_NAME, sys: system },
    );
    await expect(page.locator(`#${sheetId} ${PANEL_ROOT}`)).toBeVisible();
    return sheetId;
}

/** Drop an item on the sheet the way a drag from the sidebar or a compendium does. */
async function dropOnSheet(page: Page, sheetId: string, uuid: string): Promise<void> {
    await page.evaluate(
        ({ id, root, itemUuid }) => {
            const target = document.querySelector(`#${id} ${root}`);
            if (target === null) throw new Error('drop target missing');
            const data = new DataTransfer();
            data.setData('text/plain', JSON.stringify({ type: 'Item', uuid: itemUuid }));
            target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
        },
        { id: sheetId, root: PANEL_ROOT, itemUuid: uuid },
    );
}

async function brotherState(page: Page): Promise<{ renown: number; abilities: Array<{ name: string; category: string }> }> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.getName(name);
        if (actor === undefined) throw new Error('probe actor missing');
        return {
            renown: actor.system.renown,
            abilities: actor.items.contents.filter((i) => 'category' in i.system).map((i) => ({ name: i.name, category: i.system.category })),
        };
    }, ACTOR_NAME);
}

/** Capture the notification stack as it stands (the shared snap clears notifications first). */
async function snapNotice(page: Page, label: string): Promise<void> {
    const notices = page.locator('#notifications');
    await notices.screenshot({ path: resolve(SCREENSHOT_DIR, `game__${label}.png`) });
}

/** The fixture Mark's stored `system`, as JSON. */
async function markSystemJson(page: Page): Promise<string> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName('e2e Fixture Mark');
        return item === undefined ? '' : JSON.stringify(item.system);
    }, ACTOR_NAME);
}

async function snapPanel(page: Page, sheetId: string, label: string): Promise<void> {
    await clearScreenOverlays(page, sheetId);
    const shot = await snap(page, label, { selector: `#${sheetId} ${PANEL_ROOT}` });
    expect(shot, `snap ${label}`).not.toBeNull();
}

test.describe.serial('DW Distinctions (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async ({ name, fixture, setting }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                await w.game.actors.getName(name)?.delete();
                await w.game.items.getName(fixture)?.delete();
                if (w.game.settings.get('wh40k-rpg', setting)) await w.game.settings.set('wh40k-rpg', setting, false);
            },
            { name: ACTOR_NAME, fixture: REWARD_FIXTURE, setting: FREEFORM_SETTING },
        );
    });

    test('a drop below the Renown rank is refused with a notice', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openBrother(page, { renown: 10 });
        await clearScreenOverlays(page, sheetId);

        await dropOnSheet(page, sheetId, COMMAND_AND_CONTROL);
        const notice = page.locator('#notifications .notification', { hasText: 'Command and Control' });
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('Famed');
        await expect(notice).toContainText('Initiated');
        await snapNotice(page, 'dw-distinction-refused-notice');

        // Nothing was conferred.
        expect((await brotherState(page)).abilities).toEqual([]);
        await expect(page.locator(`#${sheetId} ${PANEL}`)).toHaveCount(0);
        await snapPanel(page, sheetId, 'dw-distinction-refused-panel');
        recordCoverage('drop.refused', 'DwDistinction.renownGate');
    });

    test('a drop at the Renown rank is accepted and a Distinction pays its Renown reward', async ({ page }) => {
        await joinOrSkip(page);
        const fixtureUuid = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.items.getName(name)?.delete();
            const item = await w.Item.create({ name, type: 'specialAbility', system: { category: 'distinction', renownReward: 5, cost: 1100 } });
            return item?.uuid ?? '';
        }, REWARD_FIXTURE);
        const sheetId = await openBrother(page, { renown: 60 });

        await dropOnSheet(page, sheetId, COMMAND_AND_CONTROL);
        const advanced = page.locator(`#${sheetId} ${PANEL}`, { hasText: 'Command and Control' });
        await expect(advanced).toBeVisible();
        await expect(advanced).toHaveAttribute('data-category', 'advanced');
        await expect(advanced).toHaveAttribute('data-rank-too-low', 'false');
        expect((await brotherState(page)).renown, 'an Advanced Special Ability pays no Renown').toBe(60);

        await dropOnSheet(page, sheetId, fixtureUuid);
        const distinction = page.locator(`#${sheetId} ${PANEL}`, { hasText: REWARD_FIXTURE });
        await expect(distinction).toBeVisible();
        await expect(distinction.locator('[data-wh40k-hook="dw-distinction-reward"]')).toHaveText('+5');
        await expect.poll(async () => (await brotherState(page)).renown).toBe(65);
        await expect(page.locator('#notifications .notification', { hasText: REWARD_FIXTURE })).toContainText('5');
        await snapNotice(page, 'dw-distinction-reward-notice');
        await snapPanel(page, sheetId, 'dw-distinction-accepted-panel');
        recordCoverage('drop.accepted', 'DwDistinction.renownReward');
    });

    test('the special-ability sheet edits the Renown fields and the panel follows (#597)', async ({ page }) => {
        await joinOrSkip(page);
        await page.evaluate(async (setting) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.settings.set('wh40k-rpg', setting, true);
        }, FREEFORM_SETTING);
        const sheetId = await openBrother(page, {});
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors
                .getName(name)
                ?.createEmbeddedDocuments('Item', [{ name: 'e2e Fixture Mark', type: 'specialAbility', system: { category: 'mark', cost: 400 } }]);
        }, ACTOR_NAME);
        const entry = page.locator(`#${sheetId} ${PANEL}`, { hasText: 'e2e Fixture Mark' });
        await expect(entry.locator('[data-wh40k-hook="dw-distinction-cost"]')).toContainText('400');

        await entry.click();
        const itemSheetId = await page.evaluate((name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            return (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName('e2e Fixture Mark')?.sheet.id ?? '';
        }, ACTOR_NAME);
        const itemSheet = page.locator(`#${itemSheetId}`);
        await expect(itemSheet.locator('[data-distinction-panel]')).toBeVisible();
        // #597: read-only, no section heading sits over nothing (the fixture Mark has no Description or Benefit).
        expect(await emptyContentSections(page, itemSheetId)).toEqual([]);
        const shown = await shownContentSections(page, itemSheetId);
        expect(shown).not.toContain('WH40K.Item.Tabs.Description');
        expect(shown).not.toContain('WH40K.SpecialAbility.Benefit');
        // snap() alone: closing the other windows would close the Battle-Brother's sheet, checked below.
        await snap(page, 'dw-special-ability-sheet-read-only', { selector: `#${itemSheetId}` });

        await itemSheet.locator('[data-action="toggleEditMode"]').click();
        await itemSheet.locator('[name="system.renownRequired"]').selectOption('respected');
        const cost = itemSheet.locator('[name="system.cost"]');
        await cost.fill('750');
        await cost.dispatchEvent('change');

        // Both edits are saved on the Mark (#612: the sheet's form used to drop them), and it is still a Mark.
        await expect.poll(async () => markSystemJson(page)).toMatch(/"renownRequired":"respected".*"cost":750|"cost":750.*"renownRequired":"respected"/);
        const saved = await markSystemJson(page);
        expect(saved, saved).toContain('"category":"mark"');

        await expect(entry.locator('[data-wh40k-hook="dw-distinction-cost"]')).toContainText('750');
        await expect(entry.locator('[data-wh40k-hook="dw-distinction-rank"]')).toHaveText('Respected');
        // Renown 0 is Initiated: the edited Respected requirement locks the Mark.
        await expect(entry).toHaveAttribute('data-rank-too-low', 'true');
        await snap(page, 'dw-special-ability-sheet-edited', { selector: `#${itemSheetId}` });
        await snapPanel(page, sheetId, 'dw-distinction-panel-after-edit');
        recordCoverage('sheet.edit', 'SpecialAbilitySheet.distinction');
    });

    test('the retired Distinction id lists load as owned special abilities', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openBrother(page, {
            renown: 45,
            distinctions: ['Tyrannic War Veteran', 'e2e Unresolved Honour'],
            marksOfDistinction: ['Watcher'],
        });

        const state = await brotherState(page);
        expect(state.abilities).toEqual(
            expect.arrayContaining([
                { name: 'Tyrannic War Veteran', category: 'distinction' },
                { name: 'e2e Unresolved Honour', category: 'distinction' },
                { name: 'Watcher', category: 'mark' },
            ]),
        );
        const entries = page.locator(`#${sheetId} ${PANEL}`);
        await expect(entries.filter({ hasText: 'Tyrannic War Veteran' })).toHaveAttribute('data-category', 'distinction');
        await expect(entries.filter({ hasText: 'e2e Unresolved Honour' })).toHaveAttribute('data-category', 'distinction');
        await expect(entries.filter({ hasText: 'Watcher' })).toHaveAttribute('data-category', 'mark');
        await snapPanel(page, sheetId, 'dw-distinction-legacy-migrated');
        recordCoverage('migration', 'DwDistinction.legacyLists');
    });
});
