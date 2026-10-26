import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#701 item 3): the voidcraft Crew tab's Ship Officers table rendered its
 * header only. It now lists each ship role the ship holds with the character
 * serving in it, shows an empty state when the ship has no roles, and assigns a
 * role to a character through a dialog.
 */

const PANEL = '[data-wh40k-hook="ship-officers-panel"]';
const OFFICER = 'e2e-701 Officer Gus';

function ship(name: string): object {
    return { name, type: 'rt-voidcraft', system: { gameSystem: 'rt', hullType: 'frigate' } };
}

test.describe.serial('voidcraft Ship Officers (Tier B, #701)', () => {
    test('a ship with no roles shows an empty state', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, { data: ship('e2e-701 Unstaffed Frigate') });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'crew');
            const panel = page.locator(`#${sheetId} ${PANEL}`);
            await expect(panel).toContainText('This ship has no officer roles.');
            await snap(page, 'ship-officers-empty', { selector: `#${sheetId}` });
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });

    test('a role lists as Unassigned, and Assign names the character serving in it', async ({ page }) => {
        await joinOrSkip(page);
        const officer = await createActor(page, { data: { name: OFFICER, type: 'rt-character', system: { gameSystem: 'rt' } } });
        const actor = await createActor(page, {
            data: ship('e2e-701 Staffed Frigate'),
            items: [{ name: 'Purser', type: 'shipRole', system: { effect: '<p>Keeps the ship’s accounts.</p>' } }],
        });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'crew');
            const row = page.locator(`#${sheetId} ${PANEL} [data-item-table-cell="name"]`).filter({ hasText: 'Purser' }).locator('..');
            await expect(row).toContainText('Unassigned');
            await expect(row).toContainText('Keeps the ship’s accounts.');

            await row.locator('[data-action="assignShipOfficer"]').click();
            const dialog = page.locator('dialog.application').filter({ has: page.locator('select[name="officer"]') });
            await expect(dialog).toBeVisible();
            await dialog.locator('select[name="officer"]').selectOption({ label: OFFICER });
            await snap(page, 'ship-officers-assign-dialog', { selector: 'dialog.application[open]', keepWindow: 'dialog' });
            await dialog.locator('button[data-action="ok"]').click();
            await expect(dialog).toBeHidden();

            await expect(page.locator(`#${sheetId} ${PANEL}`)).toContainText(OFFICER);
            // The row's toolbar has its own column, on the role's line, not wrapped beneath its name.
            const nameBox = await row.locator('[data-item-table-cell="name"]').boundingBox();
            const assignBox = await row.locator('[data-action="assignShipOfficer"]').boundingBox();
            expect(nameBox).not.toBeNull();
            expect(assignBox).not.toBeNull();
            expect(Math.abs((assignBox?.y ?? 0) - (nameBox?.y ?? 0))).toBeLessThan((nameBox?.height ?? 0) || 30);
            expect(assignBox?.x ?? 0).toBeGreaterThan((nameBox?.x ?? 0) + (nameBox?.width ?? 0));
            await snap(page, 'ship-officers-assigned', { selector: `#${sheetId}` });
        } finally {
            await deleteDocuments(page, { actors: [actor.id, officer.id] });
        }
    });
});
