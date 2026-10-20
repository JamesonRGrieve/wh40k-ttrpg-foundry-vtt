import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: item sheets lay out their detail sections (Effect, Description, Notes,
 * Source) as one shared titled panel, item-detail-section.hbs (#686).
 *
 * The gear sheet's Description tab used bare `<h3>`s that Foundry drew as large
 * plain headings, over a raw textarea; the armour sheet used titled panels. Each
 * case opens the sheet where its sections live, checks the panels and their
 * titles, and captures them.
 */

const PREFIX = 'e2e-686';
/** The least gap between a panel's left border and its body content (the body's `tw-p-3` is 12px). */
const MIN_BODY_INSET_PX = 8;

interface Case {
    type: string;
    /** The tab holding the sections; null for the weapon sheet's single scroll. */
    tab: string | null;
    /** The section title keys, in order. */
    sections: readonly string[];
}

/** `system.notes` carries one title on every item sheet. */
const NOTES_KEY = 'WH40K.ItemSheet.Common.GmNotes';

const CASES: readonly Case[] = [
    {
        type: 'gear',
        tab: 'description',
        sections: ['WH40K.ItemSheet.Gear.MechanicalEffect', 'WH40K.Tabs.Description', NOTES_KEY, 'WH40K.Common.Source'],
    },
    { type: 'armour', tab: 'description', sections: ['WH40K.Tabs.Effect', 'WH40K.Tabs.Description', NOTES_KEY, 'WH40K.Common.Source'] },
    { type: 'weapon', tab: null, sections: ['WH40K.Tabs.Description', NOTES_KEY] },
];

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<{ sheet: ProbeApp } | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ sheet: ProbeApp; delete: () => Promise<void> }> } };
}

async function openSheet(page: Page, type: string): Promise<string> {
    return page.evaluate(
        async ({ itemType, name }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({
                name,
                type: itemType,
                system: {
                    description: { value: '<p>Issued to the Ordo cell.</p>' },
                    notes: 'Kept by the Ordo clerk.',
                    source: { book: 'Dark Heresy 2e Core', page: '178' },
                },
            });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        },
        { itemType: type, name: `${PREFIX} ${type}` },
    );
}

test.describe.serial('item detail sections share one titled panel (Tier B, #686)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) {
                await item.sheet.close();
                await item.delete();
            }
        }, PREFIX);
    });

    for (const c of CASES) {
        test(`${c.type}: the detail sections are titled panels`, async ({ page }) => {
            await joinOrSkip(page);
            const appId = await openSheet(page, c.type);
            const sheet = page.locator(`#${appId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, appId);
            // The weapon sheet keeps its sections in a body that opens collapsed.
            if (c.tab === null) await sheet.locator('[data-action="toggleBody"]').first().click();
            else await sheet.locator(`nav [data-tab="${c.tab}"]`).first().click();
            const scope = c.tab === null ? sheet : sheet.locator(`.tab[data-tab="${c.tab}"]`);
            const panels = scope.locator('[data-item-section]');
            await expect(panels.first()).toBeVisible();
            expect(await panels.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['itemSection'] ?? ''))).toEqual([...c.sections]);
            const titles = await panels.locator('header h3').allTextContents();
            expect(titles.every((title) => title.trim() !== '' && !title.includes('WH40K.'))).toBe(true);
            // Every body's content sits inset from its panel's left border, on every sheet
            // alike (the weapon's Description body once sat flush against it).
            const insets = await panels.evaluateAll((els) =>
                els.map((el) => {
                    const content = el.querySelector('[data-item-section-body] > *');
                    return content === null ? -1 : Math.round(content.getBoundingClientRect().left - el.getBoundingClientRect().left);
                }),
            );
            expect(
                insets.every((inset) => inset >= MIN_BODY_INSET_PX),
                `body insets ${insets.join(', ')}`,
            ).toBe(true);
            await panels.first().scrollIntoViewIfNeeded();
            await snap(page, `item-detail-sections-${c.type}`, { selector: `#${appId}` });
            recordCoverage('sheet.section', `${c.type}.detail-sections`);
        });
    }
});
