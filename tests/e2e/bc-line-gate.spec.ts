import type { Locator, Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Black Crusade line gate (#596) on real Foundry.
 *
 * The ritual, psychic-test and apotheosis actions used to gate on a property the
 * actor never has, so they returned on every actor and never fired. The gate now
 * reads the actor's own `system.gameSystem`. This drives each action from a BC
 * Heretic's sheet — button, dialog, chat card — and shows a DH2 character neither
 * offers the BC panels nor runs the actions when one is invoked on its sheet.
 */

const BC_NAME = 'e2e-bc-line-gate-heretic';
const DH2_NAME = 'e2e-bc-line-gate-acolyte';
const DIALOG = 'dialog.application[open]';

interface ProbeSheet {
    id: string;
    options: { actions: Record<string, ((this: ProbeSheet, event: Event, target: HTMLElement) => Promise<void> | void) | undefined> };
    render: (opts: { force: boolean }) => Promise<void>;
    element: HTMLElement;
}
interface ProbeActor {
    system: { daemonPrinceAscension: { ascendedAt: number | null } };
    sheet: ProbeSheet;
    update: (data: object) => Promise<object>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        messages: { contents: Array<{ id: string }> };
    };
    ui: { sidebar?: { changeTab?: (tab: string, group: string) => void; expand?: () => void } };
}

async function openActor(page: Page, name: string, type: string, system: object): Promise<string> {
    return page.evaluate(
        async ({ actorName, actorType, sys }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(actorName)?.delete();
            const actor = await w.Actor.create({ name: actorName, type: actorType, system: sys });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return actor.sheet.id;
        },
        { actorName: name, actorType: type, sys: system },
    );
}

async function messageCount(page: Page): Promise<number> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
    return page.evaluate(() => (globalThis as unknown as ProbeWindow).game.messages.contents.length);
}

/** Wait for a new chat message after `before`, show the chat log, and return the card's locator and id. */
async function newCard(page: Page, before: number): Promise<{ id: string; card: Locator }> {
    await expect.poll(async () => messageCount(page)).toBeGreaterThan(before);
    const id = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        w.ui.sidebar?.expand?.();
        w.ui.sidebar?.changeTab?.('chat', 'primary');
        return w.game.messages.contents.at(-1)?.id ?? '';
    });
    const card = page.locator(`#sidebar li.chat-message[data-message-id="${id}"]`);
    await expect(card).toBeVisible();
    return { id, card };
}

/** Open a dialog from a panel button, snap it, and confirm it. */
async function confirmDialog(page: Page, button: Locator, label: string, fill?: (dialog: Locator) => Promise<void>): Promise<void> {
    await button.click();
    const dialog = page.locator(DIALOG).last();
    await expect(dialog).toBeVisible();
    if (fill !== undefined) await fill(dialog);
    const dialogId = (await dialog.getAttribute('id')) ?? '';
    // snap() alone: closing the other windows would close the sheet the dialog came from.
    await snap(page, label, { selector: `#${dialogId}` });
    await dialog.locator('button[data-action="ok"]').click();
    await expect(page.locator(`#${dialogId}`)).toHaveCount(0);
}

/** Snap a chat card with the chat log in view and no window over it (closes the sheets: snap them first). */
async function snapCard(page: Page, id: string, label: string): Promise<void> {
    await clearScreenOverlays(page);
    const selector = await showChatMessage(page, id);
    const shot = await snap(page, label, { selector });
    expect(shot, `snap ${label}`).not.toBeNull();
    // Every BC card is a dark surface whose text clears WCAG AA (the crimson-on-dark-red headers did not).
    await expect(page.locator(`${selector} [data-wh40k-surface="dark"]`)).toBeVisible();
    expect(await scanContrast(page, `${selector} [data-wh40k-surface="dark"]`), `${label} contrast`).toEqual([]);
}

test.describe.serial('BC line gate (Tier B, #596)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async (names) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                for (const name of names) await w.game.actors.getName(name)?.delete();
            },
            [BC_NAME, DH2_NAME],
        );
    });

    test('a BC Heretic performs a Chaos Ritual from the sheet', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openActor(page, BC_NAME, 'bc-character', { gameSystem: 'bc', ritualMastery: 2 });
        const panel = page.locator(`#${sheetId} section.wh40k-bc-ritual-panel`);
        await expect(panel).toBeVisible();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'bc-line-gate-ritual-panel', { selector: `#${sheetId} section.wh40k-bc-ritual-panel` });

        const before = await messageCount(page);
        await confirmDialog(page, panel.locator('[data-action="bcPerformRitual"]'), 'bc-line-gate-ritual-dialog', async (dialog) => {
            await dialog.locator('input[name="templateId"]').fill('Summon the Bloodletter');
            await dialog.locator('input[name="baseTarget"]').fill('40');
        });
        const { id, card } = await newCard(page, before);
        await expect(card).toContainText('Summon the Bloodletter');
        await snapCard(page, id, 'bc-line-gate-ritual-card');
        recordCoverage('action', 'bcPerformRitual');
    });

    test('a BC Heretic makes a psychic test from the sheet', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openActor(page, BC_NAME, 'bc-character', { gameSystem: 'bc', psykerClass: 'bound', psyRating: 3 });
        const panel = page.locator(`#${sheetId} section.wh40k-bc-psychic-panel`);
        await expect(panel).toBeVisible();

        const before = await messageCount(page);
        await confirmDialog(page, panel.locator('[data-action="bcPsychicTest"]'), 'bc-line-gate-psychic-dialog', async (dialog) => {
            await dialog.locator('select[name="mode"]').selectOption('fettered');
        });
        const { id, card } = await newCard(page, before);
        // #178: Fettered halves PR rounding up (the BC rules), so a PR 3 Bound psyker manifests at 2, not 1.
        await expect(card).toContainText(/Effective PR\s*2(?!\d)/);
        await snapCard(page, id, 'bc-line-gate-psychic-card');
        recordCoverage('action', 'bcPsychicTest');
    });

    test('apotheosis is locked below 100 Corruption and ascends at it', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openActor(page, BC_NAME, 'bc-character', { gameSystem: 'bc', corruption: 60, chaosAlignment: 'khorne' });
        const panel = page.locator(`#${sheetId} section.wh40k-bc-daemon-prince-panel`);
        const ascend = panel.locator('[data-action="bcAscend"]');
        await expect(ascend).toBeDisabled();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'bc-line-gate-apotheosis-locked', { selector: `#${sheetId} section.wh40k-bc-daemon-prince-panel` });

        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.update({ 'system.corruption': 100 });
        }, BC_NAME);
        await expect(ascend).toBeEnabled();

        const before = await messageCount(page);
        await confirmDialog(page, ascend, 'bc-line-gate-apotheosis-confirm');
        const { id } = await newCard(page, before);
        await expect
            .poll(async () =>
                page.evaluate(
                    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                    (name) => (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.system.daemonPrinceAscension.ascendedAt ?? null,
                    BC_NAME,
                ),
            )
            .not.toBeNull();
        await expect(ascend).toHaveCount(0);
        // #646: the panel and the card name the patron by its label, never the raw id "khorne".
        await expect(panel).toContainText('Patron: Khorne');
        await expect(panel).not.toContainText('Patron: khorne');
        const cardText = await page.evaluate((messageId) => document.querySelector(`[data-message-id="${messageId}"]`)?.textContent ?? '', id);
        expect(cardText).toContain('Patron: Khorne');
        expect(cardText).not.toContain('Patron: khorne');
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'bc-line-gate-apotheosis-ascended', { selector: `#${sheetId} section.wh40k-bc-daemon-prince-panel` });
        await snapCard(page, id, 'bc-line-gate-apotheosis-card');
        recordCoverage('action', 'bcAscend');
    });

    test('a DH2 character neither shows the BC panels nor runs the BC actions', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openActor(page, DH2_NAME, 'dh2-character', { gameSystem: 'dh2', corruption: 100, psyRating: 3 });
        const sheet = page.locator(`#${sheetId}`);
        await expect(sheet.locator('[data-tab="overview"]').first()).toBeVisible();
        for (const panel of [
            'section.wh40k-bc-ritual-panel',
            'section.wh40k-bc-psychic-panel',
            'section.wh40k-bc-daemon-prince-panel',
            'section.wh40k-bc-gifts-panel',
        ]) {
            await expect(sheet.locator(panel)).toHaveCount(0);
        }

        // A stale wiring that dispatches a BC action on this sheet does nothing.
        const before = await messageCount(page);
        const dialogsBefore = await page.locator(DIALOG).count();
        const ran = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const sheetApp = (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.sheet;
            if (sheetApp === undefined) return [];
            const invoked: string[] = [];
            for (const action of ['bcPerformRitual', 'bcPsychicTest', 'bcAscend']) {
                const handler = sheetApp.options.actions[action];
                if (handler === undefined) continue;
                await handler.call(sheetApp, new Event('click'), sheetApp.element);
                invoked.push(action);
            }
            return invoked;
        }, DH2_NAME);
        expect(ran, 'the BC actions are registered on the shared character sheet').toEqual(['bcPerformRitual', 'bcPsychicTest', 'bcAscend']);
        await expect(page.locator(DIALOG)).toHaveCount(dialogsBefore);
        expect(await messageCount(page), 'no chat card was posted').toBe(before);
        expect(
            await page.evaluate(
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                (name) => (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.system.daemonPrinceAscension.ascendedAt ?? null,
                DH2_NAME,
            ),
        ).toBeNull();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'bc-line-gate-dh2-overview', { selector: `#${sheetId}` });
        recordCoverage('gate', 'actorLineGate.dh2');
    });
});
