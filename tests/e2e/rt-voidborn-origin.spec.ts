import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B for content#37: Rogue Trader's Void Born home world is RT Core's.
 *
 * RT's pack stubs DH2's Voidborn, and that document had no RT branch, so an RT
 * character took DH2's text, DH2's citation and DH2's mechanics. The
 * canonical now carries RT's own branch (RT Core p.18). The test puts the RT pack's
 * Void Born on a Rogue Trader character, opens the owned origin's sheet (which
 * resolves to the owner's line), and checks the Description tab shows RT's
 * source and text.
 */

const RT_VOID_BORN = 'Compendium.wh40k-rpg.rt-core-origins-homeworlds.Item.DH2VdBrn00000006';

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

    test('an RT character’s Void Born shows RT Core’s source and text', async ({ page }) => {
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
        // The Grants tab shows RT Core's mechanics: −5 Strength, +5 Willpower, Ship Dialect, the Void Born talents.
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
        const page18 = description.locator('input[name="system.source.page"]');
        await expect(book).toBeVisible();
        await expect(book).toHaveValue('RT: Core Rulebook');
        await expect(page18).toBeVisible();
        await expect(page18).toHaveValue('18');
        await expect(description).toContainText('Toughness Bonus');
        await book.scrollIntoViewIfNeeded();
        await snapElement(page, 'rt-voidborn-origin-description-source', `#${sheetId}`, sheetId);
        recordCoverage('sheet.render', 'originPath.rt.homeWorld.voidBorn');
    });
});
