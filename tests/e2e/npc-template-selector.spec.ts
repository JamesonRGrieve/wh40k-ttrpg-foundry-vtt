import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: the NPC template selector works end to end on real Foundry.
 *
 * Its template read context the dialog never provided (`filteredTemplates`,
 * `targetThreat`, …) and called the `eq` value helper as a block, so it listed
 * nothing; and Create made an `npcV2` actor, a type Foundry does not register.
 * The GM opens it (the `game.wh40k.openTemplateSelector()` macro API), picks a
 * template, sees the preview at a threat level, and creates the NPC.
 */

const TEMPLATE_NAME = 'e2e Template Cultist';

interface ProbeDoc {
    id: string;
    name: string;
    type: string;
    delete: () => Promise<void>;
    sheet?: { close: () => Promise<void> } | null;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeDoc | null> };
    game: {
        items: { filter: (fn: (i: ProbeDoc) => boolean) => ProbeDoc[] };
        actors: { filter: (fn: (a: ProbeDoc) => boolean) => ProbeDoc[] };
        wh40k: { openTemplateSelector: (options?: object) => Promise<object | null> };
    };
    foundry: { applications: { instances: Map<string, { id: string; constructor: { name: string }; close: () => Promise<void> }> } };
}

async function cleanUp(page: Page): Promise<void> {
    await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        for (const actor of w.game.actors.filter((a) => a.name === name)) {
            await actor.sheet?.close();
            await actor.delete();
        }
        for (const item of w.game.items.filter((i) => i.name === name)) await item.delete();
    }, TEMPLATE_NAME);
}

test.describe.serial('NPC template selector (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await cleanUp(page);
    });

    test('lists templates, previews the chosen one at a threat level and creates the NPC', async ({ page }) => {
        await joinOrSkip(page);
        await cleanUp(page);
        const dialogId = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.Item.create({
                name,
                type: 'npcTemplate',
                system: { category: 'humanoid', faction: 'Chaos', baseThreatLevel: 4 },
            });
            void w.game.wh40k.openTemplateSelector();
            await globalThis.wh40kE2E.waitFor(
                () => [...w.foundry.applications.instances.values()].some((app) => app.constructor.name === 'TemplateSelector'),
                'template selector rendered',
            );
            return [...w.foundry.applications.instances.values()].find((app) => app.constructor.name === 'TemplateSelector')?.id ?? '';
        }, TEMPLATE_NAME);

        const dialog = page.locator(`#${dialogId}`);
        const row = dialog.locator('[data-action="selectTemplate"]', { hasText: TEMPLATE_NAME });
        await expect(row).toBeVisible();
        await expect(row).toContainText('Humanoid');
        await expect(row).toContainText('Chaos');
        await expect(dialog.locator('[data-action="create"]')).toBeDisabled();
        await clearScreenOverlays(page, dialogId);
        await snap(page, 'npc-template-selector-list', { selector: `#${dialogId}` });

        // Filter by faction, then pick the template.
        await dialog.locator('[name="filterFaction"]').selectOption('Chaos');
        await expect(dialog.locator('[name="filterFaction"]')).toHaveValue('Chaos');
        await expect(row).toBeVisible();
        await row.click();
        await expect(row).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.locator('[data-tsel="selection"]')).toContainText(TEMPLATE_NAME);

        // Raise the threat: the preview re-scales.
        const before = await dialog.locator('[data-preview="wounds"]').textContent();
        // A range input cannot be typed into; drag-equivalent: set the value and fire input + change as the browser does.
        await dialog.locator('[name="threatLevel"]').evaluate((el: HTMLInputElement) => {
            el.value = '20';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(dialog.locator('[data-tsel="threat-value"]')).toHaveText('20');
        await expect(dialog.locator('[name="threatLevel"]')).toHaveValue('20');
        await expect(dialog.locator('[data-preview="wounds"]')).not.toHaveText(before ?? '');
        await expect(dialog.locator('[data-characteristic]').first()).toBeVisible();
        await expect(dialog.locator('[data-action="create"]')).toBeEnabled();
        await clearScreenOverlays(page, dialogId);
        await snap(page, 'npc-template-selector-selected', { selector: `#${dialogId}` });

        await dialog.locator('[data-action="create"]').click();
        await expect(dialog).toBeHidden();
        const created = await page.evaluate((name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            return w.game.actors.filter((a) => a.name === name).map((a) => a.type);
        }, TEMPLATE_NAME);
        expect(created).toEqual(['dh2-npc']);
        recordCoverage('dialog.render', 'TemplateSelector');
        recordCoverage('dialog.action', 'TemplateSelector.create');
    });
});
