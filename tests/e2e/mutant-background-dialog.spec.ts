import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import {
    LOWEST_FACE,
    addCompendiumItems,
    cleanupProbes,
    forceDice,
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
 * Tier B coverage of the Mutant background (#91): starting Corruption, and a
 * starting mutation rolled on the Mutations table in place of the normal roll.
 *
 *   - The Mutant origin, dropped from the compendium onto a character, applies
 *     its 10 Corruption when the world next readies (the boot origin-grant
 *     reconcile) and queues NO Malignancy Test for it.
 *   - The GM opens the dialog through `game.wh40k.prompts.openMutantBackgroundDialog`
 *     (the same dialog the origin builder opens after committing a Mutant) and
 *     rolls the starting mutation: 5d10 on the Mutations table, the mutation
 *     added to the character, the Twisted Flesh flag set, the card posted.
 *   - A character without the Mutant origin cannot roll; Cancel writes nothing.
 */

const DIALOG = 'form.mutant-background-dialog';
const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';
const MUTANT_ORIGIN = 'Compendium.wh40k-rpg.dh2-within-origins-backgrounds.Item.DH2WMutBkg000006';

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

/** The names of an actor's owned items of one type. */
async function itemNames(page: Page, actorId: string, type: string): Promise<string[]> {
    return page.evaluate(
        ({ id, itemType }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (game) have no repo types
            const w = globalThis as unknown as { game: { actors: { get: (i: string) => { items: Array<{ type: string; name: string }> } | undefined } } };
            return (w.game.actors.get(id)?.items ?? []).filter((i) => i.type === itemType).map((i) => i.name);
        },
        { id: actorId, itemType: type },
    );
}

/** A dh2 character carrying the Mutant origin, its Corruption applied by a world boot. */
async function mutantCharacter(page: Page): Promise<{ actorId: string; sheetId: string }> {
    const ids = await openProbeSheet(page, { name: 'Mutant Applicant', type: 'dh2-character', system: { gameSystem: 'dh2', corruption: 0 } });
    await addCompendiumItems(page, ids.actorId, [MUTANT_ORIGIN]);
    // Rejoin: the world readies again and its origin-grant reconcile applies the origin.
    await joinOrSkip(page);
    await expect.poll(async () => readActorSystem(page, ids.actorId, 'corruption')).toBe(10);
    await showSheetTab(page, ids.actorId, 'overview');
    return ids;
}

test.describe.serial('Mutant background (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test("the Mutant origin's 10 starting Corruption lands at world ready and owes no Malignancy Test", async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, {
            name: 'Mutant Applicant',
            type: 'dh2-character',
            system: { gameSystem: 'dh2', corruption: 0 },
        });
        await snapElement(page, 'mutant-background-sheet-before', `#${sheetId} ${VITALS}`, sheetId);
        await addCompendiumItems(page, actorId, [MUTANT_ORIGIN]);
        await joinOrSkip(page);
        await expect.poll(async () => readActorSystem(page, actorId, 'corruption')).toBe(10);
        expect(await readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);

        await showSheetTab(page, actorId, 'overview');
        const vitals = page.locator(`#${sheetId} ${VITALS}`);
        // The first mental row is Corruption: its value span reads the 10.
        await expect(vitals.locator('.wh40k-mental-value').first()).toHaveText(/^\s*10\s*$/u);
        await expect(vitals.locator('[data-action="rollMalignancyTest"]')).toHaveCount(0);
        await snapElement(page, 'mutant-background-sheet-corruption-no-test', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('origin.resources', 'mutant-corruption-no-malignancy');
    });

    test('Roll Starting Mutation rolls 5d10 on the Mutations table, adds the mutation and Twisted Flesh, and posts the card', async ({ page }) => {
        const { actorId, sheetId } = await mutantCharacter(page);
        before = await messageIds(page);

        const dialogId = await openForActor(page, actorId);
        const dialog = page.locator(`#${dialogId}`);
        await expect(dialog.locator('[data-mutant-row="corruption"]')).toContainText('+10');
        await expect(dialog.locator('[data-mutant-row="no-malignancy"]')).toBeVisible();
        await expect(dialog.locator('[data-mutant-row="mutation"]')).toContainText('5d10');
        await expect(dialog).toContainText('Mutant Applicant');
        await snapElement(page, 'mutant-background-dialog', `#${dialogId}`, dialogId);

        // Every die on its lowest face: 5d10 = 5, the Mutations table's first band (1–6).
        await forceDice(page, LOWEST_FACE);
        await dialog.locator('[data-action="apply"]').click();
        // The card is the dialog's last step, posted after the mutation and the Twisted Flesh
        // flag are both written (two separate updates): read the actor's state once it is in.
        const card = await waitForMessage(page, before, 'mutant-twisted-flesh-rule');
        await expect.poll(async () => itemNames(page, actorId, 'mutation')).toEqual(['Bestial Hide']);
        await expect.poll(async () => readActorFlag(page, actorId, 'twistedFlesh')).toBe(true);
        expect(await readActorSystem(page, actorId, 'corruption')).toBe(10);
        expect(await readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);

        expect(card.content).toContain('Mutant Applicant');
        expect(card.content).toContain('5d10 = 5');
        expect(card.content).toContain('Bestial Hide');
        expect(card.content).not.toContain('data-action=');
        await snapMessage(page, 'mutant-background-card', card.id);
        // The +10 was once dark text on the card's dark green (no colour of its own).
        const unreadable = await scanContrast(page, `#sidebar .chat-log [data-message-id="${card.id}"] [data-wh40k-system]`);
        expect(unreadable.filter((run) => run.text.includes('+10') || run.text.includes('Bestial Hide'))).toEqual([]);

        await showSheetTab(page, actorId, 'overview');
        await snapElement(page, 'mutant-background-sheet-after', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('dialog.render', 'MutantBackgroundDialog');
    });

    test('a character without the Mutant origin has no starting mutation to roll', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Plain Applicant', type: 'dh2-character', system: { gameSystem: 'dh2', corruption: 0 } });
        const dialogId = await openForActor(page, actorId);
        const dialog = page.locator(`#${dialogId}`);
        await expect(dialog.locator('[data-mutant-row="no-origin"]')).toBeVisible();
        await expect(dialog.locator('[data-action="apply"]')).toBeDisabled();
        await snapElement(page, 'mutant-background-dialog-no-origin', `#${dialogId}`, dialogId);
        await dialog.locator('[data-action="cancel"]').click();
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);
    });

    test('Cancel writes nothing', async ({ page }) => {
        const { actorId } = await mutantCharacter(page);
        before = await messageIds(page);
        const dialogId = await openForActor(page, actorId);
        await page.locator(`#${dialogId} [data-action="cancel"]`).click();
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);
        expect(await readActorSystem(page, actorId, 'corruption')).toBe(10);
        expect(await readActorFlag(page, actorId, 'twistedFlesh')).toBeUndefined();
        expect(await itemNames(page, actorId, 'mutation')).toEqual([]);
        expect(await messageIds(page)).toEqual(before);
    });
});
