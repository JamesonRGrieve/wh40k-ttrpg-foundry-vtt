import type { Locator, Page } from '@playwright/test';
import { overflowingLabels } from '../../src/module/testing/label-fit';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for the Only War Regimental Drawbacks panel (#160).
 *
 * The OW character holds two real drawbacks from Hammer of the Emperor,
 * stored as compendium UUIDs, and a Multiple Comrades roster of Comrade
 * names. The old fixture used invented ids ("short-rations"), which the panel
 * could only print raw. The panel must show each drawback by its document's
 * name, never a UUID, a raw id or "[broken link]". Each drawback refunds the
 * Regiment Creation Points its book prints (content#32): Doomed 7 and The Few 5
 * (Hammer of the Emperor Table 1-5). The spec then removes a drawback, adds a Comrade through
 * the prompt, and removes one, all through the panel's own buttons.
 */

const DOOMED = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.70dcc1a74d10b5dc';
const THE_FEW = 'Compendium.wh40k-rpg.ow-hammer-origins-regimental-drawbacks.Item.0e3e5f403cafdd8a';
const PANEL = '.wh40k-ow-drawback-panel';
const DIALOG = 'dialog.application[open]';

interface DrawbackState {
    drawbacks: string[];
    primary: string | null;
    additional: string[];
}

async function drawbackState(page: Page, actorId: string): Promise<DrawbackState> {
    return page.evaluate((id) => {
        interface System {
            regimentDrawbacks: string[];
            multiComradeRoster: { primaryId: string; additionalIds: string[] } | null;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: System } | undefined } } };
        const sys = g.game.actors.get(id)?.system;
        if (sys === undefined) throw new Error('actor not found');
        return {
            drawbacks: [...sys.regimentDrawbacks],
            primary: sys.multiComradeRoster?.primaryId ?? null,
            additional: [...(sys.multiComradeRoster?.additionalIds ?? [])],
        };
    }, actorId);
}

/** The drawback rows as shown: name and refund label. */
async function shownRows(panel: Locator): Promise<Array<{ name: string; refund: string }>> {
    return panel.locator('li[data-drawback-id]').evaluateAll((items) =>
        items.map((li) => ({
            name: li.querySelector('[data-field="drawback-name"]')?.textContent.trim() ?? '',
            refund: li.querySelector('[data-field="drawback-refund"]')?.textContent.trim() ?? '',
        })),
    );
}

test.describe.serial('OW Regimental Drawbacks panel (Tier B, #160)', () => {
    test('names real drawbacks and Comrades, and removes and adds through the panel', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, {
            data: {
                name: 'e2e-160 Guardsman',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    comrade: { name: 'Trooper Vellis', state: 'unharmed', distanceM: 3, hasVisualLine: true },
                    regimentDrawbacks: [DOOMED, THE_FEW],
                    multiComradeRoster: { primaryId: 'Trooper Vellis', additionalIds: ['Trooper Arkos', 'Trooper Jadek'] },
                },
            },
        });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'overview');
            const panel = page.locator(`#${sheetId} ${PANEL}`);
            await panel.scrollIntoViewIfNeeded();
            await expect
                .poll(async () => shownRows(panel))
                .toEqual([
                    { name: 'Doomed', refund: '+7' },
                    { name: 'The Few', refund: '+5' },
                ]);
            await expect(panel.locator('[data-refund-total]')).toContainText('+12');
            await snap(page, 'ow-drawback-panel', { selector: `#${sheetId} ${PANEL}` });
            const text = (await panel.textContent()) ?? '';
            for (const bad of ['Compendium.', '[broken link]', '+0', 'undefined']) expect(text, `the panel must not show "${bad}"`).not.toContain(bad);
            const roster = panel.locator('[data-field="multi-comrade-roster"]');
            await expect(roster.locator('[data-primary-id]')).toContainText('Trooper Vellis');
            await expect(roster.locator('li[data-comrade-id]')).toHaveText(['Trooper Arkos', 'Trooper Jadek']);

            // Remove Doomed.
            await panel.locator(`li[data-drawback-id="${DOOMED}"] button[data-action="owToggleDrawback"]`).click();
            await expect.poll(async () => (await drawbackState(page, actor.id)).drawbacks).toEqual([THE_FEW]);
            await expect.poll(async () => shownRows(panel)).toEqual([{ name: 'The Few', refund: '+5' }]);
            await expect(panel.locator('[data-refund-total]')).toContainText('+5');

            // Add a Comrade by name through the prompt, then remove one.
            await roster.locator('button[data-action="owAddComrade"]').click();
            const dialog = page.locator(DIALOG).last();
            await expect(dialog).toBeVisible();
            await dialog.locator('input[name="comradeId"]').fill('Trooper Orlan');
            await dialog.locator('button[data-action="ok"]').click();
            await expect.poll(async () => (await drawbackState(page, actor.id)).additional).toEqual(['Trooper Arkos', 'Trooper Jadek', 'Trooper Orlan']);
            await roster.locator('li[data-comrade-id="Trooper Arkos"] button[data-action="owRemoveComrade"]').click();
            await expect.poll(async () => (await drawbackState(page, actor.id)).additional).toEqual(['Trooper Jadek', 'Trooper Orlan']);
            await expect(roster.locator('li[data-comrade-id]')).toHaveText(['Trooper Jadek', 'Trooper Orlan']);
            await snap(page, 'ow-drawback-panel-after-edits', { selector: `#${sheetId} ${PANEL}` });

            recordCoverage('panel.render', 'OwDrawbackPanel');
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });

    test('adds a drawback by a drop and from the compendiums, refunding its Regiment Creation Points', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, {
            data: { name: 'e2e-160 Recruit', type: 'ow-character', system: { gameSystem: 'ow', regimentDrawbacks: [] } },
        });
        const itemId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global has no browser-side types
            const g = globalThis as unknown as { Item: { create: (data: object) => Promise<{ id: string } | null> } };
            const item = await g.Item.create({
                name: 'e2e-160 Short Rations',
                type: 'originPath',
                system: { step: 'regimentalDrawback', gameSystem: 'ow', regimentPoints: 3 },
            });
            return item?.id ?? '';
        });
        expect(itemId).not.toBe('');
        try {
            const sheetId = await openActorSheet(page, actor.id, 'overview');
            const panel = page.locator(`#${sheetId} ${PANEL}`);
            await panel.scrollIntoViewIfNeeded();
            await expect(panel.locator('[data-ow-drawback-drop]')).toBeVisible();

            // A drawback dropped on the sheet is recorded, not owned, and refunds its points.
            const dropped = await page.evaluate(
                async ({ actorId, id }) => {
                    interface Sheet {
                        _onDropItem: (event: DragEvent, item: object) => Promise<boolean>;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                    const g = globalThis as unknown as {
                        game: {
                            actors: { get: (i: string) => { sheet: Sheet; items: { size: number } } | undefined };
                            items: { get: (i: string) => { uuid: string } | undefined };
                        };
                    };
                    const target = g.game.actors.get(actorId);
                    const item = g.game.items.get(id);
                    if (target === undefined || item === undefined) throw new Error('actor or item not found');
                    const before = target.items.size;
                    await target.sheet._onDropItem(new DragEvent('drop'), item);
                    return { uuid: item.uuid, ownedAdded: target.items.size - before };
                },
                { actorId: actor.id, id: itemId },
            );
            expect(dropped.ownedAdded).toBe(0);
            await expect.poll(async () => (await drawbackState(page, actor.id)).drawbacks).toEqual([dropped.uuid]);
            await expect.poll(async () => shownRows(panel)).toEqual([{ name: 'e2e-160 Short Rations', refund: '+3' }]);
            await expect(panel.locator('[data-refund-total]')).toContainText('+3');
            await expect(panel.locator('[data-adjusted-budget]')).toHaveText('= 15');

            // Add Drawback offers the compendium drawbacks by name.
            await panel.locator('button[data-action="owAddDrawback"]').click();
            const dialog = page.locator(DIALOG).last();
            await expect(dialog).toBeVisible();
            // #668: every name, "Lost Home World" included, fits inside its button.
            const choices = dialog.locator('[data-item-choices] button');
            await expect(choices.filter({ hasText: /^Lost Home World$/ })).toHaveCount(1);
            expect(await choices.evaluateAll(overflowingLabels)).toEqual([]);
            await snap(page, 'ow-drawback-picker', { selector: 'dialog.application[open]' });
            await dialog.locator('button', { hasText: /^Doomed$/ }).click();
            await expect.poll(async () => (await drawbackState(page, actor.id)).drawbacks).toEqual([dropped.uuid, DOOMED]);
            // Doomed refunds the 7 points Hammer of the Emperor prints (content#32).
            await expect
                .poll(async () => shownRows(panel))
                .toEqual([
                    { name: 'e2e-160 Short Rations', refund: '+3' },
                    { name: 'Doomed', refund: '+7' },
                ]);
            await expect(panel.locator('[data-refund-total]')).toContainText('+10');
            await expect(panel.locator('[data-adjusted-budget]')).toHaveText('= 22');
            await snap(page, 'ow-drawback-panel-added', { selector: `#${sheetId} ${PANEL}` });
            recordCoverage('action', 'owAddDrawback');
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                const g = globalThis as unknown as { game: { items: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                await g.game.items.get(id)?.delete();
            }, itemId);
        }
    });
});
