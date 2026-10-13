import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import {
    cleanupProbes,
    messageIds,
    openProbeSheet,
    readActorFlag,
    readActorSystem,
    showSheetTab,
    snapElement,
    snapMessage,
    waitForMessage,
} from './occult-sheet-flow';

/**
 * Tier B coverage of the Mutant background dialog (#91), opened the way the GM
 * does — through the `game.wh40k.prompts.openMutantBackgroundDialog(actor)`
 * launcher — and confirmed with its Apply button:
 *
 *   - the dialog names the actor, the +10 starting Corruption and the Twisted
 *     Flesh grant;
 *   - Apply writes `system.corruption` (+10) and the Twisted Flesh flag the
 *     Malignancy flow reads, posts the background card, and closes;
 *   - Cancel writes nothing.
 */

const DIALOG = 'form.mutant-background-dialog';
const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';

/** Open the dialog for an actor through the GM launcher; returns the dialog's element id. */
async function openForActor(page: Page, actorId: string): Promise<string> {
    await page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (game) have no repo types
        const w = globalThis as unknown as {
            game: { actors: { get: (i: string) => object | undefined }; wh40k: { prompts: { openMutantBackgroundDialog: (a: object | null) => void } } };
        };
        w.game.wh40k.prompts.openMutantBackgroundDialog(w.game.actors.get(id) ?? null);
    }, actorId);
    const dialog = page.locator(DIALOG).last();
    await expect(dialog.locator('[data-talent="twisted-flesh"]')).toBeVisible();
    return (await dialog.getAttribute('id')) ?? '';
}

test.describe.serial('MutantBackgroundDialog (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test('Apply writes +10 Corruption and the Twisted Flesh flag, and posts the card', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, {
            name: 'Mutant Applicant',
            type: 'dh2-character',
            system: { gameSystem: 'dh2', corruption: 0 },
        });
        await snapElement(page, 'mutant-background-sheet-before', `#${sheetId} ${VITALS}`, sheetId);

        const dialogId = await openForActor(page, actorId);
        const dialog = page.locator(`#${dialogId}`);
        await expect(dialog).toContainText('+10');
        await expect(dialog).toContainText('Mutant Applicant');
        await snapElement(page, 'mutant-background-dialog', `#${dialogId}`, dialogId);

        await dialog.locator('[data-action="apply"]').click();
        await expect.poll(async () => readActorSystem(page, actorId, 'corruption')).toBe(10);
        expect(await readActorFlag(page, actorId, 'twistedFlesh')).toBe(true);
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);

        const card = await waitForMessage(page, before, 'mutant-twisted-flesh-rule');
        expect(card.content).toContain('Mutant Applicant');
        expect(card.content).not.toContain('data-action=');
        await snapMessage(page, 'mutant-background-card', card.id);
        // The +10 was once dark text on the card's dark green (no colour of its own).
        const unreadable = await scanContrast(page, `#sidebar .chat-log [data-message-id="${card.id}"] [data-wh40k-system]`);
        expect(unreadable.filter((run) => run.text.includes('+10'))).toEqual([]);

        await showSheetTab(page, actorId, 'overview');
        await snapElement(page, 'mutant-background-sheet-after', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('dialog.render', 'MutantBackgroundDialog');
    });

    test('Cancel writes nothing', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Undecided Applicant', type: 'dh2-character', system: { gameSystem: 'dh2', corruption: 3 } });
        const dialogId = await openForActor(page, actorId);
        await page.locator(`#${dialogId} [data-action="cancel"]`).click();
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);
        expect(await readActorSystem(page, actorId, 'corruption')).toBe(3);
        expect(await readActorFlag(page, actorId, 'twistedFlesh')).toBeUndefined();
        expect(await messageIds(page)).toEqual(before);
    });
});
