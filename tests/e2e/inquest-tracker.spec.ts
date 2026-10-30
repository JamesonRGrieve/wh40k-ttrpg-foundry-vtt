import type { Page } from '@playwright/test';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the warband Inquest tracker (a DH2 supplement rule,
 * #90), driven the way the GM uses it: the DH2 character sheet's Party Overview
 * shows the Inquests panel, its Open Tracker button opens the GM tracker, and
 * every change is a click or a typed field in that dialog. Crossing a Revelation
 * threshold posts the Revelation card; resolving posts the Influence card
 * (from the Inquest reward table). DH1 prints no Inquest rules, so its sheet has no panel.
 *
 * DH2 values (dh2-config): Hereticus Minoris needs 600 IP and pays 3 Influence;
 * a Revelation every 300 IP; clues 50 / 100 / 200 IP, +25 when relevant to the
 * lead investigator; ±10 IP per lead-test degree.
 */

const TRACKER_ID = 'inquest-tracker-dialog';
const TRACKER = `#${TRACKER_ID}`;

/** Raise an application window above the others. */
async function bringToFront(page: Page, appId: string): Promise<void> {
    await page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications` registry has no browser-side types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { bringToFront: () => void }> } } };
        g.foundry.applications.instances.get(id)?.bringToFront();
    }, appId);
}

/**
 * Snap part of a window that stays open: raise it rather than closing the
 * others, because the sheet and the tracker are both used again afterwards.
 */
async function snapApp(page: Page, appId: string, label: string, selector: string): Promise<void> {
    await bringToFront(page, appId);
    expect(await snap(page, label, { selector }), `${label} screenshot`).not.toBeNull();
}

interface ProbeActor {
    error: string | null;
    actorId: string;
    sheetId: string;
}

/** Create a character of `line`, open its sheet on the Overview tab, and clear the stored Inquests (kept for restore). */
async function openCharacterSheet(page: Page, line: 'dh2' | 'dh1'): Promise<ProbeActor> {
    return page.evaluate(async (gameSystem): Promise<ProbeActor> => {
        interface ActorDoc {
            id: string;
            sheet: { id: string; render: (force: boolean) => Promise<object>; changeTab: (tab: string, group: string) => void };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, game.settings) have no browser-side types
        const g = globalThis as unknown as {
            Actor: { create: (data: object) => Promise<ActorDoc | null> };
            game: { settings: { get: (s: string, k: string) => string; set: (s: string, k: string, v: string) => Promise<string> } };
            __inquestProbe?: { actorIds: string[]; inquests: string };
        };
        const probe = g.__inquestProbe ?? { actorIds: [], inquests: g.game.settings.get('wh40k-rpg', 'warband-inquests') };
        g.__inquestProbe = probe;
        await g.game.settings.set('wh40k-rpg', 'warband-inquests', '[]');
        const actor = await g.Actor.create({ name: `Inquest Probe (${gameSystem})`, type: `${gameSystem}-character`, system: { gameSystem } });
        if (actor === null) return { error: 'Actor.create returned null', actorId: '', sheetId: '' };
        probe.actorIds.push(actor.id);
        await actor.sheet.render(true);
        actor.sheet.changeTab('overview', 'primary');
        return { error: null, actorId: actor.id, sheetId: actor.sheet.id };
    }, line);
}

async function teardown(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, foundry.applications) have no browser-side types
        const g = globalThis as unknown as {
            game: {
                actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                settings: { set: (s: string, k: string, v: string) => Promise<string> };
            };
            foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } };
            __inquestProbe?: { actorIds: string[]; inquests: string };
        };
        await g.foundry.applications.instances.get('inquest-tracker-dialog')?.close();
        const probe = g.__inquestProbe;
        if (probe === undefined) return;
        for (const id of probe.actorIds) {
            // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own actors
            await g.game.actors.get(id)?.delete();
        }
        await g.game.settings.set('wh40k-rpg', 'warband-inquests', probe.inquests);
        g.__inquestProbe = undefined;
    });
}

/** The ids of every chat message posted so far. */
async function messageIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        (globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } }).game.messages.contents.map((m) => m.id),
    );
}

/** Wait for one new Inquest card after `before` and return its id. */
/** Wait for one new Inquest card of `kind` after `before`; returns its id and stored content. */
async function newInquestCard(page: Page, before: readonly string[], kind: 'revelation' | 'resolution'): Promise<{ id: string; html: string }> {
    let found = { id: '', html: '' };
    await expect
        .poll(async () => {
            found = await page.evaluate(
                ({ seen, cardKind }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                    const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string; content: string }> } } };
                    const message = g.game.messages.contents.find((m) => !seen.includes(m.id) && m.content.includes(`data-inquest-card="${cardKind}"`));
                    return { id: message?.id ?? '', html: message?.content ?? '' };
                },
                { seen: [...before], cardKind: kind },
            );
            return found.id;
        })
        .not.toBe('');
    return found;
}

/** Expand the sidebar on the chat log and snap one message. */
async function snapCard(page: Page, label: string, messageId: string): Promise<void> {
    const selector = await popOutChatMessage(page, messageId);
    await expect(page.locator(selector)).toBeVisible();
    expect(await snap(page, label, { selector }), `${label} screenshot`).not.toBeNull();
}

test.describe.serial('Inquest tracker (Tier B, #90)', () => {
    test('GM opens the tracker from the DH2 Party Overview, records clues and lead tests, and resolves the Inquest', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const probe = await openCharacterSheet(page, 'dh2');
            expect(probe.error, probe.error ?? '').toBeNull();
            const sheet = page.locator(`#${probe.sheetId}`);
            const panel = sheet.locator('[data-wh40k-hook="inquest-panel"]');
            await expect(panel.locator('[data-wh40k-hook="inquest-panel-empty"]')).toBeVisible();
            await clearScreenOverlays(page, probe.actorId);
            await snapApp(page, probe.sheetId, 'inquest-panel-empty', `#${probe.sheetId} [data-wh40k-hook="inquest-panel"]`);

            await panel.locator('[data-action="openInquestTracker"]').click();
            const tracker = page.locator(TRACKER);
            await expect(tracker.locator('[data-wh40k-hook="inquest-empty"]')).toBeVisible();
            await tracker.locator('[data-action="addInquest"]').click();
            const card = tracker.locator('[data-wh40k-hook="inquest-card"]').first();
            await card.locator('[data-field="target"]').fill('Lord Karheit Vorf');
            await card.locator('[data-field="objective"]').fill('Stop the phoria trade');
            await card.locator('[data-field="leadInvestigator"]').fill('Ibnad');
            await card.locator('[data-field="scope"]').selectOption('minoris');
            await tracker.locator('[data-action="save"]').click();
            await expect(tracker.locator('[data-wh40k-hook="inquest-progress"]')).toContainText('0 / 600');
            await snapApp(page, TRACKER_ID, 'inquest-tracker-new', TRACKER);

            // A vital clue relevant to the lead investigator (200 + 25), then a major clue (100): 325 IP crosses the first Revelation at 300.
            await card.locator('[data-lead-relevant]').check();
            await card.locator('[data-action="addClue"][data-significance="vital"]').click();
            await expect(card.locator('[data-field="investigationPoints"]')).toHaveValue('225');
            const beforeRevelation = await messageIds(page);
            await tracker.locator('[data-wh40k-hook="inquest-card"]').first().locator('[data-action="addClue"][data-significance="major"]').click();
            await expect(tracker.locator('[data-wh40k-hook="inquest-card"]').first().locator('[data-field="investigationPoints"]')).toHaveValue('325');
            const revelation = await newInquestCard(page, beforeRevelation, 'revelation');
            expect(revelation.html).toContain('Lord Karheit Vorf');
            expect(revelation.html).toContain('Revelation 1 of 2');

            // A lead test with one degree of failure loses 10 IP.
            await tracker.locator('[data-wh40k-hook="inquest-card"]').first().locator('[data-action="leadTest"][data-degrees="-1"]').click();
            await expect(tracker.locator('[data-field="investigationPoints"]').first()).toHaveValue('315');
            await snapApp(page, TRACKER_ID, 'inquest-tracker-after-clues', TRACKER);

            // The panel on the sheet follows the stored progress.
            await expect(sheet.locator('[data-wh40k-hook="inquest-panel-row"]')).toContainText('Lord Karheit Vorf');
            await expect(sheet.locator('[data-wh40k-hook="inquest-panel-row"]')).toContainText('315 / 600');
            await snapApp(page, probe.sheetId, 'inquest-panel-progress', `#${probe.sheetId} [data-wh40k-hook="inquest-panel"]`);

            // Typing the total to 900 (300 IP surplus) and resolving with the goals met pays 3 + 1 Influence.
            await bringToFront(page, TRACKER_ID);
            const tracked = tracker.locator('[data-wh40k-hook="inquest-card"]').first();
            await tracked.locator('[data-field="investigationPoints"]').fill('900');
            const beforeResolution = await messageIds(page);
            await tracked.locator('[data-action="resolveInquest"][data-goals-met="true"]').click();
            const resolution = await newInquestCard(page, beforeResolution, 'resolution');
            expect(resolution.html).toContain('Lord Karheit Vorf');
            expect(resolution.html).toContain('900 / 600');
            await expect(tracker.locator('[data-wh40k-hook="inquest-status"]')).toBeVisible();
            await snapApp(page, TRACKER_ID, 'inquest-tracker-resolved', TRACKER);

            await expect(sheet.locator('[data-wh40k-hook="inquest-panel-row"]')).toHaveClass(/tw-opacity-60/u);
            await snapApp(page, probe.sheetId, 'inquest-panel-resolved', `#${probe.sheetId} [data-wh40k-hook="inquest-panel"]`);

            // The cards last: their capture closes the sheet and the tracker.
            await snapCard(page, 'inquest-revelation-card', revelation.id);
            await snapCard(page, 'inquest-resolution-influence-card', resolution.id);
            recordCoverage('inquest.flow', 'panel-tracker-revelation-resolution');
        } finally {
            await teardown(page);
        }
    });

    test('a DH1 character sheet has no Inquest panel (the line prints no Inquest rules)', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const probe = await openCharacterSheet(page, 'dh1');
            expect(probe.error, probe.error ?? '').toBeNull();
            const sheet = page.locator(`#${probe.sheetId}`);
            await sheet.locator('[data-tab="overview"]').first().waitFor({ state: 'attached' });
            await expect(sheet.locator('[data-wh40k-hook="inquest-panel"]')).toHaveCount(0);
            await expect(sheet.locator('[data-action="openInquestTracker"]')).toHaveCount(0);
            recordCoverage('inquest.flow', 'absent-on-dh1');
        } finally {
            await teardown(page);
        }
    });
});
