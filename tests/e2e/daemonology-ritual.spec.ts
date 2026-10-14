import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
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
    readActorSystem,
    showSheetTab,
    snapElement,
    snapMessage,
    waitForMessage,
} from './occult-sheet-flow';

/**
 * Tier B coverage of the DH2 Enemies Beyond rituals, driven from the character
 * sheet the way a player performs them (#80 Summoning p. 59, #83 Exorcism p. 71):
 *
 *   Daemonology panel (Overview tab) → Summon / Exorcise button → ritual dialog
 *   (fill the Daemon's Willpower / bonus) → Perform → the ritual card in chat,
 *   plus the exorcist's Fatigue / Corruption written back.
 *
 * Dice are forced through Foundry's own `CONFIG.Dice.randomUniform`, so every
 * roll still goes through the real ritual pipeline and only the faces are fixed:
 * all-lowest faces bind the Daemon / cast it out, all-highest faces fail the
 * ritual / collapse the exorcist.
 */

/** A DH2 daemonologist: Willpower 50, Forbidden Lore (Daemonology) advanced to Experienced. */
const DAEMONOLOGIST = {
    name: 'Daemonologist',
    type: 'dh2-character',
    system: {
        gameSystem: 'dh2',
        characteristics: { willpower: { base: 50 }, intelligence: { base: 45 }, toughness: { base: 40 } },
        skills: { forbiddenLore: { entries: [{ name: 'Daemonology', advance: 3 }] } },
        corruption: 0,
    },
};

const PANEL = '.wh40k-daemonology-panel';
const DIALOG = 'form.daemonology-ritual-dialog';

/** Click a panel launcher and return the opened ritual dialog's element id. */
async function openRitual(page: Page, sheetId: string, hook: 'daemonology-summoning-btn' | 'daemonology-exorcism-btn'): Promise<string> {
    await page.locator(`#${sheetId} ${PANEL} [data-wh40k-hook="${hook}"]`).click();
    const dialog = page.locator(DIALOG).last();
    await expect(dialog.locator('[data-wh40k-hook="daemonology-ritual-dialog"]')).toBeVisible();
    const id = await dialog.getAttribute('id');
    if (id === null) throw new Error('ritual dialog has no id');
    return id;
}

test.describe.serial('Daemonology rituals from the sheet (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test('the panel shows the Forbidden Lore (Daemonology) total and both launchers', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, DAEMONOLOGIST);
        const panel = page.locator(`#${sheetId} ${PANEL}`);
        await expect(panel).toBeVisible();
        await expect(panel.locator('[data-action="performSummoning"]')).toBeVisible();
        await expect(panel.locator('[data-action="performExorcism"]')).toBeVisible();
        // The readout is the lore row's live total, not a placeholder.
        const total = await panel.locator('strong').first().innerText();
        expect(Number(total)).toBeGreaterThan(0);
        // Both launcher icons draw a glyph (the Summon icon was `fa-pentagram`, absent from the bundled Font Awesome: blank).
        for (const action of ['performSummoning', 'performExorcism']) {
            const glyph = await panel.locator(`[data-action="${action}"] i`).evaluate((i) => getComputedStyle(i, '::before').content);
            expect(glyph, `${action} icon glyph`).not.toMatch(/^(none|normal|""|)$/);
        }
        await snapElement(page, 'daemonology-panel', `#${sheetId} ${PANEL}`, sheetId);
        recordCoverage('panel.render', 'DaemonologyPanel');
    });

    test('Summoning: the Daemon appears and is bound (lowest faces)', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, DAEMONOLOGIST);
        const dialogId = await openRitual(page, sheetId, 'daemonology-summoning-btn');
        const dialog = page.locator(`#${dialogId}`);
        await dialog.locator('input[name="daemonWillpower"]').fill('30');
        await dialog.locator('input[name="hasTrueName"]').check();
        await snapElement(page, 'daemonology-summoning-dialog', `#${dialogId}`, dialogId);

        await forceDice(page, LOWEST_FACE);
        await dialog.locator('[data-action="perform"]').click();
        const card = await waitForMessage(page, before, 'data-ritual-mode="summoning"');
        expect(card.content).toContain('data-summoning-outcome="bound"');
        await expect(page.locator(`#${dialogId}`)).toHaveCount(0);
        await snapMessage(page, 'daemonology-summoning-card-bound', card.id);
        recordCoverage('dialog.render', 'DaemonologyRitualDialog.summoning');
        recordCoverage('chat.render', 'daemonology-ritual-chat.summoning-bound');
    });

    test('Summoning: the ritual fails and nothing answers (highest faces)', async ({ page }) => {
        const { sheetId } = await openProbeSheet(page, DAEMONOLOGIST);
        const dialogId = await openRitual(page, sheetId, 'daemonology-summoning-btn');
        await page.locator(`#${dialogId} input[name="daemonWillpower"]`).fill('30');
        await forceDice(page, HIGHEST_FACE);
        await page.locator(`#${dialogId} [data-action="perform"]`).click();
        const card = await waitForMessage(page, before, 'data-ritual-mode="summoning"');
        expect(card.content).toContain('data-summoning-outcome="failed"');
        await snapMessage(page, 'daemonology-summoning-card-failed', card.id);
        recordCoverage('chat.render', 'daemonology-ritual-chat.summoning-failed');
    });

    test('Exorcism: the Daemon is cast out over the extended test (lowest faces)', async ({ page }) => {
        const { sheetId, actorId } = await openProbeSheet(page, DAEMONOLOGIST);
        const dialogId = await openRitual(page, sheetId, 'daemonology-exorcism-btn');
        const dialog = page.locator(`#${dialogId}`);
        await dialog.locator('input[name="daemonWillpowerBonus"]').fill('8');
        await dialog.locator('input[name="possessedCorruptionBonus"]').fill('2');
        await snapElement(page, 'daemonology-exorcism-dialog', `#${dialogId}`, dialogId);

        await forceDice(page, LOWEST_FACE);
        await dialog.locator('[data-action="perform"]').click();
        const card = await waitForMessage(page, before, 'data-ritual-mode="exorcism"');
        expect(card.content).toContain('data-exorcism-outcome="banished"');
        expect(card.content).toContain('data-wh40k-hook="exorcism-attempts"');
        // A clean banishment costs the exorcist nothing.
        expect(await readActorSystem(page, actorId, 'corruption')).toBe(0);
        expect(await readActorSystem(page, actorId, 'fatigue.value')).toBe(0);
        await snapMessage(page, 'daemonology-exorcism-card-banished', card.id);
        // The breakdown rows and the attempts table are legible on the dark card (they inherited dark text before).
        const cardRoot = `#sidebar .chat-log .message[data-message-id="${card.id}"] [data-wh40k-surface="dark"]`;
        await expect(page.locator(cardRoot)).toBeVisible();
        expect(await scanContrast(page, cardRoot)).toEqual([]);
        recordCoverage('dialog.render', 'DaemonologyRitualDialog.exorcism');
        recordCoverage('chat.render', 'daemonology-ritual-chat.exorcism-banished');
    });

    test('Exorcism: the exorcist collapses and gains Fatigue and Corruption (highest faces)', async ({ page }) => {
        const { sheetId, actorId } = await openProbeSheet(page, DAEMONOLOGIST);
        const dialogId = await openRitual(page, sheetId, 'daemonology-exorcism-btn');
        await page.locator(`#${dialogId} input[name="daemonWillpowerBonus"]`).fill('8');
        await forceDice(page, HIGHEST_FACE);
        await page.locator(`#${dialogId} [data-action="perform"]`).click();
        const card = await waitForMessage(page, before, 'data-ritual-mode="exorcism"');
        expect(card.content).toContain('data-exorcism-outcome="collapsed"');
        // 1d10 Corruption at its highest face, and the attempts' Fatigue, land on the exorcist.
        await expect.poll(async () => readActorSystem(page, actorId, 'corruption')).toBe(10);
        expect(Number(await readActorSystem(page, actorId, 'fatigue.value'))).toBeGreaterThan(0);
        await snapMessage(page, 'daemonology-exorcism-card-collapsed', card.id);

        // The sheet reflects the write-back: reopen it on the Overview tab and frame the vitals.
        await showSheetTab(page, actorId, 'overview');
        await snapElement(
            page,
            'daemonology-exorcist-after-collapse',
            `#${sheetId} section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]`,
            sheetId,
        );
        recordCoverage('chat.render', 'daemonology-ritual-chat.exorcism-collapsed');
    });
});
