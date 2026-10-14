import type { Locator, Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — the condition art in the Effect Creation dialog's picker (#625
 * follow-up). Blinded, Fire, Blood Loss, Deafened, Pinned, Stunned, Insanity
 * and Concealed showed broken images there while their compendium documents
 * pointed at the removed `_vendored-ui` art. Opened the way a player does it:
 * character sheet → Combat tab → Create Effect → the Condition category. Every
 * listed condition's picture must have actually loaded (a broken `<img>` has no
 * natural width) from the game-icons default.
 */

const EFFECT_DIALOG = '.wh40k-effect-creation-dialog';
const GAME_ICONS = 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/';

/** Open a fresh `type` character's Create Effect dialog on the Condition category; returns the dialog and the actor id. */
async function openConditionPicker(page: Page, type: string, gameSystem: string): Promise<{ dialog: Locator; actorId: string }> {
    const ids = await page.evaluate(
        async (args) => {
            interface SheetActor {
                id: string;
                sheet: { id: string; render: (o: object) => Promise<object>; setPosition: (p: object) => void };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { Actor: { create: (d: object) => Promise<SheetActor | null> } };
            const actor = await g.Actor.create({ name: `Condition Art Probe (${args.gameSystem})`, type: args.type, system: { gameSystem: args.gameSystem } });
            if (actor === null) return { actorId: '', sheetId: '' };
            await actor.sheet.render({ force: true });
            actor.sheet.setPosition({ left: 120, top: 20 });
            return { actorId: actor.id, sheetId: actor.sheet.id };
        },
        { type, gameSystem },
    );
    expect(ids.actorId, 'the probe character is created').not.toBe('');
    await clearScreenOverlays(page, ids.sheetId);
    await page.locator(`#${ids.sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
    const create = page.locator(`#${ids.sheetId} [data-action="createEffect"]:visible`).first();
    await expect(create).toBeVisible();
    await create.click();
    const dialog = page.locator(EFFECT_DIALOG).first();
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-action="selectCategory"][data-category="condition"]').click();
    await expect(dialog.locator('[data-action="selectCondition"]').first()).toBeVisible();
    return { dialog, actorId: ids.actorId };
}

/** The picker tile for `name`: its image source and whether the image loaded. */
async function tileArt(dialog: Locator, name: string): Promise<{ src: string; loaded: boolean }> {
    const img = dialog
        .locator('[data-action="selectCondition"]')
        .filter({ has: dialog.page().getByText(name, { exact: true }) })
        .locator('img');
    await expect(img).toHaveCount(1);
    // Wait for the hotlinked SVG to finish loading before reading its natural size.
    await expect.poll(async () => img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
    return img.evaluate((el: HTMLImageElement) => ({ src: el.currentSrc || el.src, loaded: el.naturalWidth > 0 }));
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        await g.game.actors.get(id)?.delete();
    }, actorId);
}

test.describe.serial('Condition picker art (Tier B)', () => {
    test.setTimeout(scaledMs(180_000));
    test.use({ actionTimeout: scaledMs(15_000) });

    test('DH2: the reported conditions show their game-icons art in the picker', async ({ page }) => {
        await joinOrSkip(page);
        const { dialog, actorId } = await openConditionPicker(page, 'dh2-character', 'dh2');
        try {
            for (const name of ['Blinded', 'Fire', 'Blood Loss', 'Deafened', 'Pinned', 'Stunned', 'Insanity']) {
                // eslint-disable-next-line no-await-in-loop -- one tile at a time, so a failure names its condition
                const art = await tileArt(dialog, name);
                expect(art.src, `${name} uses the game-icons default`).toContain(GAME_ICONS);
                expect(art.loaded, `${name}'s image loaded`).toBe(true);
            }
            const id = (await dialog.getAttribute('id')) ?? '';
            await clearScreenOverlays(page, id);
            expect(await snap(page, 'condition-picker-art-dh2', { selector: `#${id}` })).not.toBeNull();
            recordCoverage('effect-creation.flow', 'condition-picker-art-dh2');
        } finally {
            await deleteActor(page, actorId);
        }
    });

    test('RT: Concealed shows its game-icons art in the picker', async ({ page }) => {
        await joinOrSkip(page);
        const { dialog, actorId } = await openConditionPicker(page, 'rt-character', 'rt');
        try {
            const art = await tileArt(dialog, 'Concealed');
            expect(art.src).toContain(GAME_ICONS);
            expect(art.loaded, "Concealed's image loaded").toBe(true);
            const id = (await dialog.getAttribute('id')) ?? '';
            await clearScreenOverlays(page, id);
            expect(await snap(page, 'condition-picker-art-rt', { selector: `#${id}` })).not.toBeNull();
            recordCoverage('effect-creation.flow', 'condition-picker-art-rt');
        } finally {
            await deleteActor(page, actorId);
        }
    });
});
