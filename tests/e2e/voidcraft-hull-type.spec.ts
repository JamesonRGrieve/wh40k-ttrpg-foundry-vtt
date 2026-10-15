import type { Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #647: a voidcraft's hull type is a `WH40K.hullTypes` id that ship
 * components match against, but the sheet offered a free-text input. It now shows
 * the hull type's label, and in edit mode (the header's pencil) a select over the
 * hull types. A stored value outside them (a pack ship's "space-station") reads as
 * stored and keeps its own option, so an edit-mode save never rewrites it.
 */

const HULL = '[data-wh40k-hook="voidcraft-hull-type"]';

function ship(name: string, hullType: string): object {
    return { name, type: 'rt-voidcraft', system: { gameSystem: 'rt', hullType, hullClass: 'Test' } };
}

/** The voidcraft's stored hull type. */
async function storedHullType(page: Page, actorId: string): Promise<string | null> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: { hullType: string } } | undefined } } };
        return g.game.actors.get(id)?.system.hullType ?? null;
    }, actorId);
}

test.describe.serial('Voidcraft hull type (Tier B, #647)', () => {
    test('the sidebar shows the hull type label, and edit mode is a select that saves the id', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, { data: ship('e2e-647 Light Cruiser', 'light-cruiser') });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'stats');
            const hull = page.locator(`#${sheetId} ${HULL}`);
            await expect(hull.locator('[data-wh40k-hook="voidcraft-hull-type-label"]')).toHaveText('Light Cruiser');
            await expect(hull.locator('input[name="system.hullType"]')).toHaveCount(0);
            await snap(page, 'voidcraft-hull-type-read', { selector: `#${sheetId}` });

            await hull.locator('[data-action="toggleEditMode"]').click();
            const select = page.locator(`#${sheetId} ${HULL} select[name="system.hullType"]`);
            await expect(select).toHaveValue('light-cruiser');
            await snap(page, 'voidcraft-hull-type-edit', { selector: `#${sheetId}` });
            await select.selectOption('cruiser');
            await expect.poll(async () => storedHullType(page, actor.id)).toBe('cruiser');
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });

    test('a hull type outside the enum reads as stored, and an edit-mode save leaves it alone', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, { data: ship('e2e-647 Station', 'space-station') });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'stats');
            const hull = page.locator(`#${sheetId} ${HULL}`);
            await expect(hull.locator('[data-wh40k-hook="voidcraft-hull-type-label"]')).toHaveText('space-station');
            await hull.locator('[data-action="toggleEditMode"]').click();
            await expect(page.locator(`#${sheetId} ${HULL} select[name="system.hullType"]`)).toHaveValue('space-station');
            // An unrelated edit submits the whole form, the hull-type select with it.
            await page.locator(`#${sheetId} input[name="system.hullClass"]`).fill('Orbital');
            await page.locator(`#${sheetId} input[name="system.hullClass"]`).press('Tab');
            await expect
                .poll(async () =>
                    page.evaluate((id) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: { hullClass: string } } | undefined } } };
                        return g.game.actors.get(id)?.system.hullClass ?? null;
                    }, actor.id),
                )
                .toBe('Orbital');
            expect(await storedHullType(page, actor.id)).toBe('space-station');
            await snap(page, 'voidcraft-hull-type-off-enum-edit', { selector: `#${sheetId}` });
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });
});
