import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { cleanupProbes, messageIds, openProbeSheet, readActorSystem, showSheetTab, snapElement, snapMessage, waitForMessage } from './occult-sheet-flow';

/**
 * Tier B coverage of Fate on the character sheet (#42, #63), driven through the
 * Overview vitals Fate row the way a player uses it:
 *
 *   - the row shows one pip per point of the Fate total (`fate.max`, which IS the
 *     DH2 Fate threshold since #63) and the current pool (`fate.value`);
 *   - clicking a pip spends down to it; Restore refills the pool to the total;
 *   - Burn Fate asks first, then lowers the total by one and cuts the pool to it
 *     (DH2 RAW), and announces the burn in chat.
 *
 * An origin's Fate grant reaching `fate.max` is applied by the Origin Path
 * Builder's commit, which needs a whole character built first; it is covered by
 * the unit tests (fate.test.ts, origin-grant-ledger.test.ts), not here.
 */

/** A DH2 acolyte with three Fate. */
const ACOLYTE = {
    name: 'Fated Acolyte',
    type: 'dh2-character',
    system: { gameSystem: 'dh2', fate: { max: 3, value: 3 } },
};

const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';

test.describe.serial('Fate on the character sheet (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test('pips spend the pool, Restore refills it, Burn lowers the total (#42)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, ACOLYTE);
        const vitals = page.locator(`#${sheetId} ${VITALS}`);
        const pips = vitals.locator('[data-action="setFateStar"]');
        await expect(pips).toHaveCount(3);
        await snapElement(page, 'fate-row-full', `#${sheetId} ${VITALS}`, sheetId);

        // Spend: click the second pip → two points left, the total untouched.
        await pips.nth(1).click();
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.value')).toBe(2);
        expect(await readActorSystem(page, actorId, 'fate.max')).toBe(3);
        await snapElement(page, 'fate-row-after-spend', `#${sheetId} ${VITALS}`, sheetId);

        // Burn: the confirmation names the permanence; confirming drops the total to 2.
        await vitals.locator('[data-action="spendFate"][data-fate-action="burn"]').click();
        const confirm = page.locator('.confirmation-dialog').last();
        await expect(confirm).toBeVisible();
        const confirmId = (await confirm.getAttribute('id')) ?? '';
        // Framing the dialog closes the other windows (the sheet included); the burn
        // is still awaiting the answer, and the sheet is reopened to show the result.
        await snapElement(page, 'fate-burn-confirm', `#${confirmId}`, confirmId);
        await confirm.locator('[data-action="confirm"]').click();
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.max')).toBe(2);
        expect(await readActorSystem(page, actorId, 'fate.value')).toBe(2);
        await showSheetTab(page, actorId, 'overview');
        await expect(pips).toHaveCount(2);
        await snapElement(page, 'fate-row-after-burn', `#${sheetId} ${VITALS}`, sheetId);

        const card = await waitForMessage(page, before, 'wh40k-fate-spend-message');
        expect(card.content).toContain('BURNS');
        await snapMessage(page, 'fate-burn-chat', card.id);
        recordCoverage('action', 'spendFate.burn');
    });

    test('burning with the pool spent keeps it at 0; declining writes nothing (#42)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, { ...ACOLYTE, system: { gameSystem: 'dh2', fate: { max: 2, value: 0 } } });
        const vitals = page.locator(`#${sheetId} ${VITALS}`);
        const burn = vitals.locator('[data-action="spendFate"][data-fate-action="burn"]');

        // Declining the confirmation leaves Fate alone.
        await burn.click();
        await page.locator('.confirmation-dialog').last().locator('[data-action="cancel"]').click();
        await expect(page.locator('.confirmation-dialog')).toHaveCount(0);
        expect(await readActorSystem(page, actorId, 'fate.max')).toBe(2);

        // RAW lets a character burn Fate with no points left. spendFate throttles a
        // repeat within 500 ms, so the second click is retried as a player would.
        const confirm = page.locator('.confirmation-dialog').last().locator('[data-action="confirm"]');
        await expect(async () => {
            if ((await confirm.count()) === 0) await burn.click();
            await expect(confirm).toBeVisible({ timeout: 1000 });
        }).toPass();
        await confirm.click();
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.max')).toBe(1);
        expect(await readActorSystem(page, actorId, 'fate.value')).toBe(0);
        await snapElement(page, 'fate-row-burnt-while-spent', `#${sheetId} ${VITALS}`, sheetId);

        // Restore refills the pool to the (now lower) total.
        await vitals.locator('[data-action="restoreFate"]').click();
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.value')).toBe(1);
        await snapElement(page, 'fate-row-after-restore', `#${sheetId} ${VITALS}`, sheetId);
        recordCoverage('action', 'restoreFate');
    });
});
