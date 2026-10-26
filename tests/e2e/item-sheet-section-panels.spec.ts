import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#695): every item-sheet tab titles its sections with the shared
 * item-detail-section panel, never a bare `<h2>`/`<h3>` that Foundry draws as a
 * large plain heading. The gear Overview tab showed Classification, Physical
 * Properties, Storage and Economic that way, and drew two boxes per Storage option
 * (a decorative square icon beside the real checkbox).
 *
 * Each case opens a sheet on a tab this sweep converted, checks its sections are
 * titled panels with no bare heading left, and captures it. The gear case also
 * checks each Storage option is one checkbox, which its label toggles.
 */

const PREFIX = 'e2e-695';

interface Case {
    type: string;
    tab: string;
    /** Section title keys the tab must show, in order. */
    sections: readonly string[];
    screenshot: string;
}

const CASES: readonly Case[] = [
    {
        type: 'gear',
        tab: 'overview',
        sections: [
            'WH40K.ItemSheet.Gear.Classification',
            'WH40K.ItemSheet.Gear.Storage',
            'WH40K.Ammunition.PhysicalProperties',
            'WH40K.ItemSheet.Gear.Economic',
        ],
        screenshot: 'gear-sheet-overview-panels',
    },
    {
        type: 'cybernetic',
        tab: 'properties',
        sections: ['WH40K.ItemSheet.Cybernetic.Configuration', 'WH40K.Ammunition.PhysicalProperties'],
        screenshot: 'cybernetic-sheet-properties-panels',
    },
    {
        type: 'talent',
        tab: 'properties',
        sections: ['WH40K.ItemSheet.Talent.BasicProperties', 'WH40K.ItemSheet.Talent.SpecialisationX', 'WH40K.Dialog.TalentEditor.Prerequisites'],
        screenshot: 'talent-sheet-properties-panels',
    },
];

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeItem {
    sheet: ProbeApp;
    system: { state?: { equipped?: boolean } };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => ProbeItem[]; getName: (name: string) => ProbeItem | undefined } };
}

const itemName = (type: string): string => `${PREFIX} ${type}`;

async function openSheet(page: Page, type: string): Promise<string> {
    return page.evaluate(
        async ({ itemType, name }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({ name, type: itemType });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        },
        { itemType: type, name: itemName(type) },
    );
}

async function gearEquipped(page: Page): Promise<boolean | undefined> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        return w.game.items.getName(name)?.system.state?.equipped;
    }, itemName('gear'));
}

test.describe.serial('item sheet tabs title their sections with the shared panel (Tier B, #695)', () => {
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
        test(`${c.type} ${c.tab}: sections are titled panels, no bare heading`, async ({ page }) => {
            await joinOrSkip(page);
            const appId = await openSheet(page, c.type);
            const sheet = page.locator(`#${appId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, appId);
            await sheet.locator(`nav [data-tab="${c.tab}"]`).first().click();
            const scope = sheet.locator(`div[data-tab="${c.tab}"]`);
            const panels = scope.locator('[data-item-section]');
            await expect(panels.first()).toBeVisible();

            const keys = await panels.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['itemSection'] ?? ''));
            expect(keys.filter((key) => c.sections.includes(key))).toEqual([...c.sections]);
            const titles = await panels.locator('header h3').allTextContents();
            expect(titles.every((title) => title.trim() !== '' && !title.includes('WH40K.'))).toBe(true);
            // Every heading on the tab is a panel title.
            const bare = await scope.evaluate((root) => [...root.querySelectorAll('h2, h3')].filter((h) => h.closest('[data-item-section]') === null).length);
            expect(bare).toBe(0);

            if (c.type === 'gear') {
                const options = scope.locator('[data-gear-storage] label');
                expect(await options.count()).toBeGreaterThanOrEqual(2);
                const perOption = await options.evaluateAll((labels) =>
                    labels.map((label) => ({
                        checkboxes: label.querySelectorAll('input[type="checkbox"]').length,
                        squares: label.querySelectorAll('.fa-square, .fa-check-square, .fa-square-check').length,
                    })),
                );
                expect(
                    perOption.every((o) => o.checkboxes === 1 && o.squares === 0),
                    JSON.stringify(perOption),
                ).toBe(true);
                // The one control is the real one: clicking the option's label toggles the item.
                const before = (await gearEquipped(page)) === true;
                await options
                    .filter({ has: page.locator('input[name="system.state.equipped"]') })
                    .locator('span')
                    .click();
                await expect.poll(async () => gearEquipped(page)).toBe(!before);
                // #699: an unpriced item shows "—" for cost, never a bare "₮", and Total
                // Weight reads the prepared total, never a bare "kg".
                await expect(sheet.locator('[data-field="gear-header-cost"]')).toHaveText('—');
                await expect(scope.locator('[data-field="gear-total-weight"]')).toHaveValue(/^\d+(\.\d+)? kg$/u);
            }

            await snap(page, c.screenshot, { selector: `#${appId}` });
            recordCoverage('sheet.section', `${c.type}.${c.tab}.section-panels`);
        });
    }
});
