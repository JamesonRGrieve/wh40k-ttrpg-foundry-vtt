import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import {
    cleanupProbes,
    forceDice,
    HIGHEST_FACE,
    LOWEST_FACE,
    messageIds,
    openProbeSheet,
    type ProbeActorData,
    readActorSystem,
    showSheetTab,
    snapElement,
    snapMessage,
    waitForMessage,
} from './occult-sheet-flow';

/**
 * Tier B coverage of the Malignancy Test queue (35092c9ab) and Twisted Flesh
 * (#91, within.md p. 32), driven from the character sheet:
 *
 *   gain Corruption with the Overview vitals "+" → the crossed 10-CP threshold
 *   queues a test and the "Malignancy Tests due" button appears → click it →
 *   (Twisted Flesh: Resist or Choose to Fail; then Malignancy or Mutation) →
 *   the unified roll dialog → the Malignancy Test card, and the line's own
 *   Malignancies / Mutations table drawn in chat → the queue empties.
 *
 * Lines that do not test for Malignancies (Black Crusade) never queue one.
 * Dice faces are fixed through Foundry's `CONFIG.Dice.randomUniform`.
 */

const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';
const ROLL_BUTTON = '[data-action="rollMalignancyTest"]';
const TWISTED_FLESH = { 'wh40k-rpg': { twistedFlesh: true } };

/** The roll card's own label — every Malignancy Test card carries it. */
const TEST_CARD = 'Malignancy Test';

/** An acolyte one Corruption point short of a threshold (9 → 10 by default). */
function acolyte(name: string, type = 'dh2-character', gameSystem = 'dh2', flags: object = {}, corruption = 9): ProbeActorData {
    return { name, type, flags, system: { gameSystem, corruption, characteristics: { willpower: { base: 40 } } } };
}

/** Gain one Corruption point with the vitals "+" and return the vitals locator. */
async function gainCorruption(page: Page, sheetId: string): Promise<ReturnType<Page['locator']>> {
    const vitals = page.locator(`#${sheetId} ${VITALS}`);
    await vitals.locator('[data-action="increment"][data-field="system.corruption"]').click();
    return vitals;
}

/** Answer a DialogV2 choice by its button's action id, snapping it first. */
async function choose(page: Page, action: string, label: string): Promise<void> {
    const button = page.locator(`dialog.application[open] button[data-action="${action}"]`).last();
    await expect(button).toBeVisible();
    const dialogId = (await page.locator('dialog.application[open]').last().getAttribute('id')) ?? '';
    await snapElement(page, label, `#${dialogId}`, dialogId);
    await button.click();
}

/** Roll the open unified roll dialog. */
async function rollDialog(page: Page, label: string): Promise<void> {
    const form = page.locator('form.unified-roll-dialog').last();
    await expect(form).toBeVisible();
    const formId = (await form.getAttribute('id')) ?? '';
    await snapElement(page, label, `#${formId}`, formId);
    await form.locator('[data-action="systemRoll"]').click();
}

test.describe.serial('Malignancy Tests (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test('a Corruption gain queues a test; a failed roll draws a Malignancy (DH2)', async ({ page }) => {
        // 39 → 40 crosses into Soiled, so the card carries a −10 Corruption Track row (Table 8-14).
        const { actorId, sheetId } = await openProbeSheet(page, acolyte('Tainted Acolyte', 'dh2-character', 'dh2', {}, 39));
        await expect(page.locator(`#${sheetId} ${VITALS} ${ROLL_BUTTON}`)).toHaveCount(0);

        const vitals = await gainCorruption(page, sheetId);
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(1);
        await expect(vitals.locator(ROLL_BUTTON)).toContainText('1');
        await snapElement(page, 'malignancy-queued', `#${sheetId} ${VITALS}`, sheetId);

        await vitals.locator(ROLL_BUTTON).click();
        await forceDice(page, HIGHEST_FACE);
        await rollDialog(page, 'malignancy-roll-dialog');

        const card = await waitForMessage(page, before, TEST_CARD);
        expect(card.content).toContain('Corruption Track');
        expect(card.content).toContain('Corruption takes form');
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);
        await snapMessage(page, 'malignancy-test-card-failed', card.id);

        const table = await waitForMessage(page, [...before, card.id], 'Malignanc');
        await snapMessage(page, 'malignancy-table-draw', table.id);

        await showSheetTab(page, actorId, 'overview');
        await expect(page.locator(`#${sheetId} ${VITALS} ${ROLL_BUTTON}`)).toHaveCount(0);
        await snapElement(page, 'malignancy-queue-cleared', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('action', 'rollMalignancyTest');
    });

    test('a passed test holds the taint at bay (DH2)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, acolyte('Steadfast Acolyte'));
        const vitals = await gainCorruption(page, sheetId);
        await vitals.locator(ROLL_BUTTON).click();
        await forceDice(page, LOWEST_FACE);
        await rollDialog(page, 'malignancy-roll-dialog-resist');
        const card = await waitForMessage(page, before, TEST_CARD);
        expect(card.content).toContain('held at bay');
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);
        await snapMessage(page, 'malignancy-test-card-resisted', card.id);
    });

    test('Twisted Flesh: Choose to Fail, then take a Mutation instead (#91)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, acolyte('Twisted Mutant', 'dh2-character', 'dh2', TWISTED_FLESH));
        const vitals = await gainCorruption(page, sheetId);
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(1);
        await vitals.locator(ROLL_BUTTON).click();
        await forceDice(page, HIGHEST_FACE);

        await choose(page, 'fail', 'twisted-flesh-resist-or-fail');
        await choose(page, 'mutation', 'twisted-flesh-malignancy-or-mutation');

        // No Willpower test was rolled: the Mutations table is drawn straight away.
        const mutation = await waitForMessage(page, before, 'Mutation');
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);
        await snapMessage(page, 'twisted-flesh-mutation-draw', mutation.id);
        recordCoverage('action', 'rollMalignancyTest.twistedFlesh.chooseFail');
    });

    test('Twisted Flesh: Resist, fail the test, and take the Mutation (#91)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, acolyte('Resisting Mutant', 'dh2-character', 'dh2', TWISTED_FLESH));
        const vitals = await gainCorruption(page, sheetId);
        await vitals.locator(ROLL_BUTTON).click();
        await forceDice(page, HIGHEST_FACE);

        await choose(page, 'resist', 'twisted-flesh-choose-resist');
        await rollDialog(page, 'twisted-flesh-roll-dialog');
        await choose(page, 'mutation', 'twisted-flesh-failed-test-mutation-choice');

        const card = await waitForMessage(page, before, TEST_CARD);
        expect(card.content).toContain('the taint takes the flesh');
        await expect.poll(async () => readActorSystem(page, actorId, 'malignancyTestsPending')).toBe(0);
        await snapMessage(page, 'twisted-flesh-test-card-mutation-instead', card.id);
        recordCoverage('action', 'rollMalignancyTest.twistedFlesh.resist');
    });

    test('Only War queues a test; Black Crusade never does', async ({ page }) => {
        const ow = await openProbeSheet(page, acolyte('Guardsman', 'ow-character', 'ow'));
        await gainCorruption(page, ow.sheetId);
        await expect.poll(async () => readActorSystem(page, ow.actorId, 'malignancyTestsPending')).toBe(1);
        await expect(page.locator(`#${ow.sheetId} ${VITALS} ${ROLL_BUTTON}`)).toBeVisible();
        await snapElement(page, 'malignancy-queued-ow', `#${ow.sheetId} ${VITALS}`, ow.sheetId);

        const bc = await openProbeSheet(page, acolyte('Heretic', 'bc-character', 'bc'));
        await gainCorruption(page, bc.sheetId);
        await expect.poll(async () => readActorSystem(page, bc.actorId, 'corruption')).toBe(10);
        expect(await readActorSystem(page, bc.actorId, 'malignancyTestsPending')).toBe(0);
        await expect(page.locator(`#${bc.sheetId} ${VITALS} ${ROLL_BUTTON}`)).toHaveCount(0);
        await snapElement(page, 'malignancy-absent-bc', `#${bc.sheetId} ${VITALS}`, bc.sheetId);
    });
});
