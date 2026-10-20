import type { Locator, Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { openPackDocument, closeApp } from './lib/pack-document';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for Only War Medals and Honours (content#32).
 *
 * The real compendium medals (OW core pp. 294–295, Enemies of the Imperium
 * pp. 140–143) are conferred on an OW character from the Battlefield panel's
 * Add Award, and by a drop on the sheet. Each shows by name with its Squad Bonus,
 * never a UUID or "[broken link]". The medal's own sheet shows what it is awarded
 * for and its Squad Bonus.
 */

const WINGED_SKULL = 'Compendium.wh40k-rpg.ow-core-items-medals.Item.OWcMedalWingSk01';
const HUNTERS = 'Compendium.wh40k-rpg.ow-enemies-items-medals.Item.OWeMedalHunter01';
const PANEL = '.wh40k-ow-battlefield-panel';
const DIALOG = 'dialog.application[open]';

async function conferred(page: Page, actorId: string): Promise<string[]> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: { regimentalAwards: string[] } } | undefined } } };
        return [...(g.game.actors.get(id)?.system.regimentalAwards ?? [])];
    }, actorId);
}

async function shownAwards(panel: Locator): Promise<Array<{ name: string; bonus: string }>> {
    return panel.locator('li[data-award-id]').evaluateAll((rows) =>
        rows.map((row) => {
            const label = row.querySelector('span[title]');
            return { name: label?.textContent.trim() ?? '', bonus: label?.getAttribute('title') ?? '' };
        }),
    );
}

test.describe.serial('OW Medals and Honours (Tier B, content#32)', () => {
    test('confers real medals from Add Award and by a drop, each named with its Squad Bonus', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, {
            data: { name: 'e2e-c32 Sergeant', type: 'ow-character', system: { gameSystem: 'ow', regimentalAwards: [] } },
        });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'overview');
            const panel = page.locator(`#${sheetId} ${PANEL}`);
            await panel.scrollIntoViewIfNeeded();
            await expect(panel.locator('[data-ow-award-drop]')).toBeVisible();

            // Add Award offers the compendium medals by name.
            await panel.locator('button[data-action="owAddAward"]').click();
            const dialog = page.locator(DIALOG).last();
            await expect(dialog).toBeVisible();
            await expect(dialog.locator('button', { hasText: /^Winged Skull$/ })).toHaveCount(1);
            await expect(dialog.locator('button', { hasText: /^Hunters$/ })).toHaveCount(1);
            await snap(page, 'ow-medal-picker', { selector: DIALOG });
            await dialog.locator('button', { hasText: /^Winged Skull$/ }).click();
            await expect.poll(async () => conferred(page, actor.id)).toEqual([WINGED_SKULL]);

            // A medal dropped on the sheet is conferred, not owned.
            const ownedAdded = await page.evaluate(
                async ({ actorId, uuid }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals have no browser-side types
                    const g = globalThis as unknown as {
                        game: {
                            actors: {
                                get: (
                                    i: string,
                                ) => { sheet: { _onDropItem: (e: DragEvent, i: object) => Promise<boolean> }; items: { size: number } } | undefined;
                            };
                        };
                        fromUuid: (u: string) => Promise<object | null>;
                    };
                    const target = g.game.actors.get(actorId);
                    const medal = await g.fromUuid(uuid);
                    if (target === undefined || medal === null) throw new Error('actor or medal not found');
                    const before = target.items.size;
                    await target.sheet._onDropItem(new DragEvent('drop'), medal);
                    return target.items.size - before;
                },
                { actorId: actor.id, uuid: HUNTERS },
            );
            expect(ownedAdded).toBe(0);
            await expect.poll(async () => conferred(page, actor.id)).toEqual([WINGED_SKULL, HUNTERS]);

            await expect
                .poll(async () => shownAwards(panel))
                .toEqual([
                    { name: 'Winged Skull', bonus: '+10 to all Command Tests.' },
                    {
                        name: 'Hunters',
                        bonus: 'The Squad is well versed in discerning the troop movements for their given enemy. The each member of the Squad gains a +10 bonus to Perception Tests to spot or track the particular enemy on the battlefield (such as Survival Tests to track them and Tests to avoid Surprise in combat).',
                    },
                ]);
            const text = (await panel.textContent()) ?? '';
            for (const bad of ['Compendium.', '[broken link]', 'undefined']) expect(text, `the panel must not show "${bad}"`).not.toContain(bad);
            await snap(page, 'ow-battlefield-panel-medals', { selector: `#${sheetId} ${PANEL}` });

            // Taking a medal away again.
            await panel.locator(`li[data-award-id="${HUNTERS}"] button[data-action="owToggleAward"]`).click();
            await expect.poll(async () => conferred(page, actor.id)).toEqual([WINGED_SKULL]);
            recordCoverage('action', 'owAddAward');
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });

    test('a medal’s sheet shows what it is awarded for and its Squad Bonus', async ({ page }) => {
        await joinOrSkip(page);
        const opened = await openPackDocument(page, { pack: 'ow-core-items-medals', name: 'Winged Skull', view: 'sheet' });
        expect(opened.detail).toBeNull();
        const appId = opened.appId ?? '';
        const sheet = page.locator(`#${appId}`);
        await expect(sheet).toContainText('Awarded For');
        await expect(sheet).toContainText('Inspirational leadership leading to righteous victory.');
        await expect(sheet).toContainText('Squad Bonus');
        await expect(sheet).toContainText('+10 to all Command Tests.');
        await snap(page, 'ow-medal-sheet-winged-skull', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
        await closeApp(page, appId);
    });
});
