import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { packHoldingId } from './lib/pack-lookup';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B for content#38: a shared home world gives each line its own book's mechanics.
 *
 * The OW and RT packs stub DH2's Hive World. Its `grants` and `modifiers` were flat
 * DH2 values, so an Only War or Rogue Trader character took DH2's mechanics. The
 * document now carries per-line mechanics. Each case puts that line's Hive World
 * on a character of the line, opens the owned origin's sheet (which resolves to
 * the owner's line), and checks the Grants tab shows the line's own values.
 */

/**
 * A line's Hive World: the stub (found by its source file's `…_<fileId>` suffix) keeps DH2's
 * Hive World `_id`, so its UUID is that id in the line's pack.
 */
function stubbedHiveWorld(line: 'ow' | 'rt', fileId: string): string {
    return `Compendium.wh40k-rpg.${packHoldingId({ line, category: 'origins-homeworlds' }, fileId)}.Item.DH2HvWrld0000004`;
}

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

/** Open the sheet of an actor's owned item; returns the sheet's element id. */
async function openOwnedSheet(page: Page, actorId: string, itemId: string): Promise<string> {
    // An item that fails validation is dropped by createEmbeddedDocuments, so the id is
    // missing: say so plainly rather than through the sheet lookup.
    expect(itemId, 'the origin embedded on the character (an invalid field drops it)').toBeDefined();
    return page.evaluate(
        async ({ actor, item }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const origin = (globalThis as unknown as ProbeWindow).game.actors.get(actor)?.items.get(item);
            if (origin === undefined) throw new Error(`origin ${item} missing`);
            await origin.sheet.render({ force: true });
            return origin.sheet.id;
        },
        { actor: actorId, item: itemId },
    );
}

test.describe.serial('Shared home worlds resolve per line (Tier B, content#38)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('an Only War character’s Hive World is OW’s own', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Hive Guardsman', type: 'ow-character', system: { gameSystem: 'ow' } });
        const [originId] = await addCompendiumItems(page, actorId, [stubbedHiveWorld('ow', 'ae1b1da8a39a0c9c')]);
        const sheetId = await openOwnedSheet(page, actorId, originId);
        const sheet = page.locator(`#${sheetId}`);
        // OW Hive World: no fixed characteristic change (+3 to two of Ag/Fel/Per is a choice), −1 starting Wound, Deceive.
        await expect(sheet.locator('[data-wh40k-hook="origin-wounds-bonus"]')).toHaveValue('-1');
        // DH2's +5 Agility / −5 Willpower are gone: OW's characteristic bonus is a choice, not a fixed change.
        await expect(sheet.locator('input[name="system.modifiers.characteristics.agility"]')).not.toHaveValue('5');
        await expect(sheet.locator('input[name="system.modifiers.characteristics.willpower"]')).not.toHaveValue('-5');
        await expect(sheet).toContainText('Deceive');
        await snapElement(page, 'shared-homeworld-hive-world-ow', `#${sheetId}`, sheetId);
        recordCoverage('sheet.render', 'originPath.ow.homeWorld.hiveWorld');
    });

    test('a Rogue Trader character’s Hive World is RT’s own', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Hive Explorer', type: 'rt-character', system: { gameSystem: 'rt' } });
        const [originId] = await addCompendiumItems(page, actorId, [stubbedHiveWorld('rt', 'sFqrqi9aW6SYJiti')]);
        const sheetId = await openOwnedSheet(page, actorId, originId);
        const sheet = page.locator(`#${sheetId}`);
        // RT Hive World: −5 Toughness, +5 Fellowship, Speak Language (Hive Dialect), the four Hive World talents.
        await expect(sheet.locator('input[name="system.modifiers.characteristics.toughness"]')).toHaveValue('-5');
        await expect(sheet.locator('input[name="system.modifiers.characteristics.fellowship"]')).toHaveValue('5');
        await expect(sheet.locator('input[name="system.modifiers.characteristics.agility"]')).not.toHaveValue('5');
        await expect(sheet).toContainText('Hive Dialect');
        await expect(sheet).toContainText('Caves of Steel (Hive World)');
        await snapElement(page, 'shared-homeworld-hive-world-rt', `#${sheetId}`, sheetId);
        recordCoverage('sheet.render', 'originPath.rt.homeWorld.hiveWorld');
    });
});
