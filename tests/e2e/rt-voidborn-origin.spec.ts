import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { packHoldingId } from './lib/pack-lookup';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B for content#37: Rogue Trader's Void Born home world is the RT rules' own.
 *
 * RT's pack stubs DH2's Voidborn, and that document had no RT branch, so an RT
 * character took DH2's text, DH2's source and DH2's mechanics. The
 * canonical now carries RT's own branch. The test puts the RT pack's
 * Void Born on a Rogue Trader character, opens the owned origin's sheet (which
 * resolves to the owner's line), and checks the Description tab shows RT's
 * source and text.
 */

/** The RT pack's Void Born: a stub (source file `…_YwBPZ0s6JNPnHNI5`) that keeps DH2's Voidborn `_id`. */
const RT_VOID_BORN = `Compendium.wh40k-rpg.${packHoldingId({ line: 'rt', category: 'origins-homeworlds' }, 'YwBPZ0s6JNPnHNI5')}.Item.DH2VdBrn00000006`;

interface ProbeSheet {
    id: string;
    render: (opts: { force: boolean }) => Promise<void>;
}
interface ProbeActor {
    items: { get: (id: string) => { sheet: ProbeSheet } | undefined };
}
interface ProbeWindow {
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
}

test.describe.serial('RT Void Born origin (Tier B, content#37)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('an RT character’s Void Born shows RT’s source and text', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Void Born Explorer', type: 'rt-character', system: { gameSystem: 'rt' } });
        const [originId] = await addCompendiumItems(page, actorId, [RT_VOID_BORN]);
        const sheetId = await page.evaluate(
            async ({ actor, item }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const origin = (globalThis as unknown as ProbeWindow).game.actors.get(actor)?.items.get(item);
                if (origin === undefined) throw new Error(`origin ${item} missing`);
                await origin.sheet.render({ force: true });
                return origin.sheet.id;
            },
            { actor: actorId, item: originId },
        );
        const sheet = page.locator(`#${sheetId}`);
        // The Grants tab shows RT's mechanics: −5 Strength, +5 Willpower, Ship Dialect, the Void Born talents.
        await expect(sheet.locator('input[name="system.modifiers.characteristics.strength"]')).toHaveValue('-5');
        await expect(sheet.locator('input[name="system.modifiers.characteristics.willpower"]')).toHaveValue('5');
        await expect(sheet).toContainText('Ship Dialect');
        await expect(sheet).toContainText('Charmed (Void Born)');
        await snapElement(page, 'rt-voidborn-origin-grants', `#${sheetId}`, sheetId);
        // The Description tab's source control and text resolve to RT too. The owner can edit the
        // origin, so the control renders Book and Page inputs.
        await sheet.locator('nav.wh40k-tabs [data-tab="description"]').click();
        const description = sheet.locator('.wh40k-tab-content > [data-tab="description"]');
        await expect(description).toBeVisible();
        const book = description.locator('input[name="system.source.book"]');
        const sourcePage = description.locator('input[name="system.source.page"]');
        await expect(book).toBeVisible();
        // An RT book, not DH2's.
        await expect(book).toHaveValue(/^RT: /u);
        await expect(sourcePage).toBeVisible();
        await expect(sourcePage).toHaveValue(/^\d+$/u);
        await expect(description).toContainText('Toughness Bonus');
        await book.scrollIntoViewIfNeeded();
        await snapElement(page, 'rt-voidborn-origin-description-source', `#${sheetId}`, sheetId);
        recordCoverage('sheet.render', 'originPath.rt.homeWorld.voidBorn');
    });
});
