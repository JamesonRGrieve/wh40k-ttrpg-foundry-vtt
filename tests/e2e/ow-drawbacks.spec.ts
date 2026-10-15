import type { Locator, Page } from '@playwright/test';
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
 * name, never a UUID, a raw id or "[broken link]". The drawback documents do
 * not carry their Regiment Creation Points yet, so the refund reads "—" rather
 * than a false "+0". The spec then removes a drawback, adds a Comrade through
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
                    { name: 'Doomed', refund: '—' },
                    { name: 'The Few', refund: '—' },
                ]);
            await snap(page, 'ow-drawback-panel', { selector: `#${sheetId} ${PANEL}` });
            const text = (await panel.textContent()) ?? '';
            for (const bad of ['Compendium.', '[broken link]', '+0', 'undefined']) expect(text, `the panel must not show "${bad}"`).not.toContain(bad);
            const roster = panel.locator('[data-field="multi-comrade-roster"]');
            await expect(roster.locator('[data-primary-id]')).toContainText('Trooper Vellis');
            await expect(roster.locator('li[data-comrade-id]')).toHaveText(['Trooper Arkos', 'Trooper Jadek']);

            // Remove Doomed.
            await panel.locator(`li[data-drawback-id="${DOOMED}"] button[data-action="owToggleDrawback"]`).click();
            await expect.poll(async () => (await drawbackState(page, actor.id)).drawbacks).toEqual([THE_FEW]);
            await expect.poll(async () => shownRows(panel)).toEqual([{ name: 'The Few', refund: '—' }]);

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
});
