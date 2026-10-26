import type { Locator, Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for the modifiers editor's Basic / Situational / Advanced tabs (#669).
 *
 * The editor sits in the content-block item sheet's Modifiers section in edit
 * mode. Clicking a tab must show that tab's content and hide the other two,
 * through Foundry's own tab mechanism. Before the fix, a click highlighted the
 * tab and left all three panels as they were.
 */

const SYSTEM_ID = 'wh40k-rpg';
const FREEFORM_KEY = 'freeform-characters';
const TABS = ['basic', 'situational', 'advanced'] as const;

interface Probe {
    itemId: string;
    sheetId: string;
    freeformBefore: boolean;
}

/** A world special ability with its sheet open, with freeform editing on so the sheet can enter edit mode. */
async function openAbilitySheet(page: Page): Promise<Probe> {
    return page.evaluate(
        async ({ systemId, freeformKey }) => {
            interface Sheet {
                id: string;
                render: (opts: { force: boolean }) => Promise<object>;
            }
            interface FoundryGlobal {
                Item: { create: (data: object) => Promise<{ id: string; sheet: Sheet } | null> };
                game: { settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, value: boolean) => Promise<boolean> } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as FoundryGlobal;
            const freeformBefore = g.game.settings.get(systemId, freeformKey);
            await g.game.settings.set(systemId, freeformKey, true);
            const item = await g.Item.create({ type: 'specialAbility', name: 'e2e-669 Modifier Tabs' });
            if (item === null) throw new Error('item not created');
            await item.sheet.render({ force: true });
            return { itemId: item.id, sheetId: item.sheet.id, freeformBefore };
        },
        { systemId: SYSTEM_ID, freeformKey: FREEFORM_KEY },
    );
}

async function cleanUp(page: Page, probe: Probe): Promise<void> {
    await page.evaluate(
        async ({ itemId, freeformBefore, systemId, freeformKey }) => {
            interface FoundryGlobal {
                game: {
                    items: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                    settings: { set: (ns: string, key: string, value: boolean) => Promise<boolean> };
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as FoundryGlobal;
            await g.game.items.get(itemId)?.delete();
            await g.game.settings.set(systemId, freeformKey, freeformBefore);
        },
        { ...probe, systemId: SYSTEM_ID, freeformKey: FREEFORM_KEY },
    );
}

test.describe.serial('modifiers editor tabs (Tier B, #669)', () => {
    test('each tab shows its own content and hides the others', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await openAbilitySheet(page);
        try {
            const sheet = page.locator(`#${probe.sheetId}`);
            await expect(sheet).toBeVisible();
            await sheet.locator('[data-action="toggleEditMode"]').first().click();
            const nav = sheet.locator('nav[data-group="modifiers"]');
            await expect(nav).toBeVisible();
            const panel = (tab: string): Locator => sheet.locator(`div[data-group="modifiers"][data-tab="${tab}"]`);
            const expectOnly = async (tab: string, when: string): Promise<void> => {
                // The `active` class itself, not the `[&.active]:` variant classes that name it.
                await expect(nav.locator(`[data-tab="${tab}"]`)).toHaveClass(/(^|\s)active(\s|$)/);
                for (const other of TABS) {
                    if (other === tab) await expect(panel(other), `${when}: the ${tab} panel shows`).toBeVisible();
                    else await expect(panel(other), `${when}: the ${other} panel is hidden`).toBeHidden();
                }
            };

            await expectOnly('basic', 'on opening');
            // #699: every characteristic box is named by its abbreviation and full name.
            const boxes = panel('basic').locator('[data-wh40k-hook="modifier-characteristic"]');
            expect(await boxes.count()).toBeGreaterThan(0);
            const unnamed = await boxes.evaluateAll(
                (labels) => labels.filter((l) => l.textContent.trim() === '' || (l.querySelector('input')?.getAttribute('aria-label') ?? '') === '').length,
            );
            expect(unnamed, 'every characteristic input has a visible abbreviation and an accessible name').toBe(0);
            for (const tab of [...TABS].reverse()) {
                await nav.locator(`[data-tab="${tab}"]`).click();
                await expectOnly(tab, `after clicking ${tab}`);
                await nav.scrollIntoViewIfNeeded();
                await snap(page, `modifiers-editor-tab-${tab}`, { selector: `#${probe.sheetId}` });
            }

            // The open tab survives a re-render of the sheet (an edit re-renders it).
            await nav.locator('[data-tab="situational"]').click();
            await page.evaluate(async (itemId) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const g = globalThis as unknown as { game: { items: { get: (id: string) => { sheet: { render: () => Promise<object> } } | undefined } } };
                await g.game.items.get(itemId)?.sheet.render();
            }, probe.itemId);
            await expectOnly('situational', 'after a re-render');
        } finally {
            await cleanUp(page, probe);
        }
    });
});
