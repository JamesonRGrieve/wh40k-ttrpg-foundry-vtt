import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { cleanupProbes, openProbeSheet } from './occult-sheet-flow';

/**
 * Tier B for #693: the live sheet roots carry `data-wh40k-system`.
 *
 * The per-system Tailwind variants (`dh2:` / `rt:` / …) resolve through a
 * `[data-wh40k-system]` ancestor, so the Dark Pacts panel (character sheet), the
 * NPC Disposition panel (NPC sheet) and the Dark Pact item sheet only theme per
 * line if their app root carries the actor's line. Their homologation stories had
 * failed in the browser; this checks the live roots.
 */

interface PactWindow {
    game: {
        actors: {
            get: (id: string) =>
                | {
                      createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
                      items: { get: (id: string) => { sheet: { id: string; render: (o: { force: boolean }) => Promise<object> } } | undefined };
                  }
                | undefined;
        };
    };
}

test.describe.serial('live sheet roots carry the actor line (Tier B, #693)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('a BC character sheet with the Dark Pacts panel is stamped bc', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, { name: 'Pact Holder', type: 'bc-character', system: { gameSystem: 'bc' } });
        await expect(page.locator(`#${sheetId}`)).toHaveAttribute('data-wh40k-system', 'bc');
        recordCoverage('sheet.render', 'character.systemDataset');
    });

    test('an RT NPC sheet with the Disposition panel is stamped rt', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, { name: 'Disposition Probe', type: 'rt-npc', system: { gameSystem: 'rt' } }, 'npc');
        await expect(page.locator(`#${sheetId}`)).toHaveAttribute('data-wh40k-system', 'rt');
        recordCoverage('sheet.render', 'npc.systemDataset');
    });

    test('an owned Dark Pact item sheet is stamped with its owner’s line', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Pact Owner', type: 'dh2-character', system: { gameSystem: 'dh2' } });
        const itemSheetId = await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const actor = (globalThis as unknown as PactWindow).game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            const created = (await actor.createEmbeddedDocuments('Item', [{ name: 'Pact of Might', type: 'darkPact' }])).at(0);
            const item = created === undefined ? undefined : actor.items.get(created.id);
            if (item === undefined) throw new Error('dark pact not created');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        }, actorId);
        await expect(page.locator(`#${itemSheetId}`)).toHaveAttribute('data-wh40k-system', 'dh2');
        await snap(page, 'dark-pact-sheet-system-dataset', { selector: `#${itemSheetId}` });
        recordCoverage('sheet.render', 'darkPact.systemDataset');
    });
});
