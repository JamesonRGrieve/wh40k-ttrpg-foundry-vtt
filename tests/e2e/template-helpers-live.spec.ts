import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of #613 on real Foundry: the templates that call `truncate`
 * render live. The helper existed only in the Storybook harness, so a live
 * render threw "Missing helper: truncate".
 *
 *   1. A character's Biography tab lists its journal entries, each with a
 *      plain-text preview of its description (the panel was never given its
 *      entries before, so it always read "no entries").
 *   2. The NPC template selector opens.
 */

const ACTOR_NAME = 'e2e-613-journal';

interface ProbeActor {
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        wh40k: { openTemplateSelector: (options?: object) => Promise<object | null> };
    };
    foundry: { applications: { instances: Map<string, { id: string; constructor: { name: string }; close: () => Promise<void> }> } };
}

test.describe.serial('Templates that call truncate render live (Tier B, #613)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.delete();
        }, ACTOR_NAME);
    });

    test('the Biography journal panel lists entries with a plain-text preview', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            const actor = await w.Actor.create({
                name,
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
                items: [
                    {
                        name: 'e2e Interrogation of the Scribe',
                        type: 'journalEntry',
                        system: {
                            time: 'Day 3',
                            place: 'Hab District 4',
                            description: { value: `<p>The scribe <strong>lied</strong> about the transfer record. ${'He named a clerk. '.repeat(12)}</p>` },
                        },
                    },
                ],
            });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return actor.sheet.id;
        }, ACTOR_NAME);
        await page.locator(`#${sheetId} [data-action="tab"][data-tab="biography"]`).first().click();
        const entry = page.locator(`#${sheetId} section.tab[data-tab="biography"] [data-action="itemEdit"]`, { hasText: 'e2e Interrogation of the Scribe' });
        await expect(entry).toBeVisible();
        const row = page.locator(`#${sheetId} section.tab[data-tab="biography"] div[data-item-id]`, { hasText: 'e2e Interrogation of the Scribe' });
        await expect(row).toContainText('Day 3');
        await expect(row).toContainText('The scribe lied about the transfer record.');
        // Plain text, cut with an ellipsis: no tags reach the screen.
        await expect(row).not.toContainText('<strong>');
        await expect(row).toContainText('…');
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'journal-panel-entry-preview', { selector: `#${sheetId} section.tab[data-tab="biography"] div[data-item-id]` });
        recordCoverage('panel.render', 'JournalPanel.truncate');
    });

    test('the NPC template selector opens', async ({ page }) => {
        await joinOrSkip(page);
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        const dialogId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            void w.game.wh40k.openTemplateSelector();
            await globalThis.wh40kE2E.waitFor(
                () => [...w.foundry.applications.instances.values()].some((app) => app.constructor.name === 'TemplateSelector'),
                'template selector rendered',
            );
            return [...w.foundry.applications.instances.values()].find((app) => app.constructor.name === 'TemplateSelector')?.id ?? '';
        });
        await expect(page.locator(`#${dialogId}`)).toBeVisible();
        expect(errors.filter((message) => message.includes('Missing helper'))).toEqual([]);
        await clearScreenOverlays(page, dialogId);
        await snap(page, 'npc-template-selector', { selector: `#${dialogId}` });
        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).foundry.applications.instances.get(id)?.close();
        }, dialogId);
        recordCoverage('dialog.render', 'TemplateSelector');
    });
});

/** The live surface the two shadowed-helper checks touch. */
interface HelperProbeWindow {
    Actor: { create: (data: object) => Promise<{ id: string; sheet: { id: string; render: (o: object) => Promise<object> } } | null> };
    Item: { create: (data: object) => Promise<{ id: string; sheet: { id: string; render: (o: object) => Promise<object> } } | null> };
    game: {
        actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
        items: { get: (id: string) => { delete: () => Promise<object> } | undefined };
        settings: { get: (scope: string, key: string) => boolean; set: (scope: string, key: string, value: boolean) => Promise<object> };
    };
}

test.describe.serial('Helpers the story harness shared with production (Tier B, #613)', () => {
    test('a craft’s armour inputs keep their min="0" (a `min` helper used to blank it)', async ({ page }) => {
        await joinOrSkip(page);
        const ids = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as HelperProbeWindow;
            const actor = await w.Actor.create({ name: 'e2e-613 Chimera', type: 'dh2-vehicle', system: { gameSystem: 'dh2' } });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return { actorId: actor.id, sheetId: actor.sheet.id };
        });
        try {
            const sheet = page.locator(`#${ids.sheetId}`);
            await sheet.locator('[data-action="tab"][data-tab="combat"]').first().click();
            for (const facing of ['front', 'side', 'rear']) {
                // eslint-disable-next-line no-await-in-loop -- three inputs on one rendered tab, checked in turn
                await expect(sheet.locator(`input[name="system.armour.${facing}.value"]`)).toHaveAttribute('min', '0');
            }
            await clearScreenOverlays(page, ids.sheetId);
            await snap(page, 'craft-armour-min', { selector: `#${ids.sheetId}` });
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                await (globalThis as unknown as HelperProbeWindow).game.actors.get(id)?.delete();
            }, ids.actorId);
        }
    });

    test('the modifiers editor renders its rows and marks their selected options (it called a missing `selected` helper)', async ({ page }) => {
        await joinOrSkip(page);
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        const setup = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as HelperProbeWindow;
            const freeform = w.game.settings.get('wh40k-rpg', 'freeform-characters');
            await w.game.settings.set('wh40k-rpg', 'freeform-characters', true);
            const item = await w.Item.create({
                name: 'e2e-613 Phobia',
                type: 'mentalDisorder',
                system: {
                    modifiers: {
                        situational: { characteristics: [{ key: 'strength', value: 5, condition: 'When cornered', icon: 'fa-exclamation-triangle' }] },
                        other: [{ key: 'fear', label: 'Fear', value: 2, mode: 'multiply' }],
                    },
                },
            });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return { itemId: item.id, sheetId: item.sheet.id, freeform };
        });
        try {
            const sheet = page.locator(`#${setup.sheetId}`);
            await sheet.locator('[data-action="toggleEditMode"]').first().click();
            await sheet.locator('[data-tab="situational"][data-group="modifiers"]').first().click();
            const characteristic = sheet.locator('select[name="system.modifiers.situational.characteristics.0.key"]');
            await expect(characteristic).toHaveValue('strength');
            // The options read the characteristics' names, not their langpack keys.
            await expect(characteristic.locator('option:checked')).toHaveText('Strength');
            await sheet.locator('[data-tab="advanced"][data-group="modifiers"]').first().click();
            await expect(sheet.locator('select[name="system.modifiers.other.0.mode"]')).toHaveValue('multiply');
            expect(errors.filter((message) => message.includes('Missing helper'))).toEqual([]);
            await clearScreenOverlays(page, setup.sheetId);
            await sheet.locator('select[name="system.modifiers.other.0.mode"]').scrollIntoViewIfNeeded();
            await snap(page, 'modifiers-editor-other-mode', { selector: `#${setup.sheetId}` });
        } finally {
            await page.evaluate(async ({ itemId, freeform }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as HelperProbeWindow;
                await w.game.items.get(itemId)?.delete();
                await w.game.settings.set('wh40k-rpg', 'freeform-characters', freeform);
            }, setup);
        }
    });
});
