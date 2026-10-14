import type { Locator, Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — the Effect Creation dialog from the actor sheet and the item sheet
 * (#516), driven the way a player and the GM use it on real Foundry:
 *
 *   1. Character sheet → Combat tab → Active Effects "Create Effect" → the
 *      dialog → the Characteristic category → Strength +10 for 3 rounds → Create:
 *      the effect lands on the actor with its change, and the Overview panel lists it.
 *   2. A world gear item's sheet → its Create Effect control → the Condition
 *      category → pick a condition: the effect lands on the ITEM (to transfer to
 *      its eventual owner) with the item as its origin, and the item lists it.
 */

const EFFECT_DIALOG = '.wh40k-effect-creation-dialog';

/**
 * Where each sheet is placed: an item sheet (600 px) fits right of the
 * In-Universe Time widget; the wide character sheet keeps its tabs on its own
 * left rail, clear of the widget, and would otherwise run under the sidebar.
 */
const SHEET_LEFT: Record<'actors' | 'items', number> = { actors: 120, items: 420 };

/** Render a document's sheet and return its window id. */
async function renderSheet(page: Page, collection: 'actors' | 'items', id: string): Promise<string> {
    const sheetId = await page.evaluate(
        async (args) => {
            interface SheetCollection {
                get: (i: string) => { sheet: { id: string; render: (o: object) => Promise<object>; setPosition: (p: object) => void } } | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: Record<'actors' | 'items', SheetCollection> };
            const sheet = g.game[args.collection].get(args.id)?.sheet;
            if (sheet === undefined) return '';
            await sheet.render({ force: true });
            // Right of the In-Universe Time widget (which sits over the top-left and
            // otherwise takes the clicks meant for the sheet's tabs), clear of the sidebar.
            sheet.setPosition({ left: args.left, top: 20 });
            return sheet.id;
        },
        { collection, id, left: SHEET_LEFT[collection] },
    );
    expect(sheetId, `the ${collection} sheet should render`).not.toBe('');
    return sheetId;
}

/** The effects a document carries: name and its change keys. */
async function effectsOf(page: Page, collection: 'actors' | 'items', id: string): Promise<Array<{ name: string; keys: string[]; origin: string | null }>> {
    return page.evaluate(
        (args) => {
            interface EffectDoc {
                name: string;
                origin: string | null;
                changes: Array<{ key: string }>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: Record<'actors' | 'items', { get: (i: string) => { effects: { contents: EffectDoc[] } } | undefined }> };
            const effects = g.game[args.collection].get(args.id)?.effects.contents ?? [];
            return effects.map((e) => ({ name: e.name, keys: e.changes.map((c) => c.key), origin: e.origin }));
        },
        { collection, id },
    );
}

/** The window id of an open dialog, for an in-place `snap` by selector. */
async function dialogId(dialog: Locator): Promise<string> {
    const id = await dialog.getAttribute('id');
    expect(id, 'the dialog window has an id').not.toBeNull();
    return id ?? '';
}

/** Wait for the Effect Creation dialog and return it. */
async function effectDialog(page: Page): Promise<Locator> {
    const dialog = page.locator(EFFECT_DIALOG).first();
    await expect(dialog).toBeVisible();
    return dialog;
}

test.describe.serial('Effect creation dialog (Tier B, #516)', () => {
    test.setTimeout(scaledMs(180_000));
    // A stuck click or fill fails with its locator instead of eating the whole test budget.
    test.use({ actionTimeout: scaledMs(15_000) });

    test('from the character sheet: a Strength +10 effect lands on the actor and in its panel', async ({ page }) => {
        await joinOrSkip(page);
        const actorId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { Actor: { create: (d: object) => Promise<{ id: string } | null> } };
            const actor = await g.Actor.create({ name: 'Effect Probe Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' } });
            return actor?.id ?? '';
        });
        expect(actorId).not.toBe('');
        try {
            const sheetId = await renderSheet(page, 'actors', actorId);
            // Clear the welcome tour (its overlay intercepts clicks) and any stray window.
            await clearScreenOverlays(page, sheetId);
            await page.locator(`#${sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
            const create = page.locator(`#${sheetId} [data-action="createEffect"]:visible`).first();
            await expect(create).toBeVisible();
            await create.click();

            const dialog = await effectDialog(page);
            await dialog.locator('[data-action="selectCategory"][data-category="characteristic"]').click();
            await expect(dialog.locator('[data-action="selectCategory"][data-category="characteristic"]')).toHaveAttribute('data-active', 'true');
            await dialog.locator('select[name="characteristic"]').selectOption('strength');
            await dialog.locator('input[name="modifierValue"]').fill('10');
            await dialog.locator('input[name="duration.rounds"]').fill('3');
            // Snapped in place: the sheet stays open behind the dialog to show the result.
            expect(await snap(page, 'effect-creation-dialog-from-actor', { selector: `#${await dialogId(dialog)}` })).not.toBeNull();

            await dialog.locator('button[type="submit"]').first().click();
            await expect(page.locator(EFFECT_DIALOG)).toHaveCount(0);
            await expect
                .poll(async () => effectsOf(page, 'actors', actorId))
                .toEqual([expect.objectContaining({ keys: ['system.characteristics.strength.modifier'] })]);
            const [effect] = await effectsOf(page, 'actors', actorId);

            // The Overview tab's Active Effects panel lists the new effect by name. (The
            // Combat tab's copy of the panel renders the chip without its name: its
            // context maps `label`, not `name` — reported separately.)
            await page.locator(`#${sheetId} [data-action="tab"][data-tab="overview"]`).first().click();
            await expect(page.locator(`#${sheetId}`).getByText(effect.name).filter({ visible: true }).first()).toBeVisible();
            await clearScreenOverlays(page, sheetId);
            expect(await snap(page, 'effect-creation-actor-panel-after', { selector: `#${sheetId}` })).not.toBeNull();
            recordCoverage('effect-creation.flow', 'actor-characteristic');
        } finally {
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                await g.game.actors.get(id)?.delete();
            }, actorId);
        }
    });

    test('from an item sheet: a condition effect lands on the item with the item as its origin', async ({ page }) => {
        await joinOrSkip(page);
        const item = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Item` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { Item: { create: (d: object) => Promise<{ id: string; uuid: string } | null> } };
            const doc = await g.Item.create({ name: 'Effect Probe Charm', type: 'gear', system: { gameSystems: ['dh2'] } });
            return { id: doc?.id ?? '', uuid: doc?.uuid ?? '' };
        });
        expect(item.id).not.toBe('');
        try {
            const sheetId = await renderSheet(page, 'items', item.id);
            await clearScreenOverlays(page, sheetId);
            // The Effects tab cannot be opened from the item tab strip: clicking it
            // collapses the window to a bare header (reported separately). The sheet's
            // own Create Effect control is dispatched in place instead — the same
            // delegated `createEffect` action handler a visible click reaches.
            const create = page.locator(`#${sheetId} [data-action="createEffect"]`).first();
            await expect(create).toHaveCount(1);
            await create.dispatchEvent('click');

            const dialog = await effectDialog(page);
            await dialog.locator('[data-action="selectCategory"][data-category="condition"]').click();
            const conditions = dialog.locator('[data-action="selectCondition"]');
            await expect(conditions.first()).toBeVisible();
            expect(await conditions.count(), 'the condition picker lists the line catalogue').toBeGreaterThan(0);
            expect(await snap(page, 'effect-creation-dialog-from-item', { selector: `#${await dialogId(dialog)}` })).not.toBeNull();

            const pick = conditions.first();
            const conditionName = (await pick.innerText()).trim();
            await pick.click();
            await expect(page.locator(EFFECT_DIALOG)).toHaveCount(0);
            // The effect is the picked condition, and it records the item as its origin.
            await expect.poll(async () => effectsOf(page, 'items', item.id)).toEqual([expect.objectContaining({ name: conditionName, origin: item.uuid })]);

            // The sheet re-renders with the effect in its (hidden) Effects tab.
            await expect(page.locator(`#${sheetId} [data-effect-id]`).filter({ hasText: conditionName })).not.toHaveCount(0);
            recordCoverage('effect-creation.flow', 'item-condition');
        } finally {
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game: { items: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                await g.game.items.get(id)?.delete();
            }, item.id);
        }
    });
});
