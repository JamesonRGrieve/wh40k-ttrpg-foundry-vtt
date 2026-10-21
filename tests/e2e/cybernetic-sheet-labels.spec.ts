import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#696): the cybernetic sheet's header badges and Type field show the
 * type and body locations as langpack strings. They showed the raw
 * `WH40K.CyberneticType.Replacement` (and raw keys for eyes, ears, organs and the
 * other non-armour locations), built from a key path with no entries.
 */

const NAME = 'e2e-696 cybernetic';

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeItem {
    sheet: ProbeApp;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => ProbeItem[] } };
}

test.describe.serial('cybernetic sheet labels (Tier B, #696)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name === name)) {
                await item.sheet.close();
                await item.delete();
            }
        }, NAME);
    });

    test('the header badges and Type field show the type and locations, not langpack keys', async ({ page }) => {
        await joinOrSkip(page);
        const appId = await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({ name, type: 'cybernetic', system: { type: 'integrated-weapon', locations: ['eyes', 'leftArm', 'organs'] } });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        }, NAME);
        const sheet = page.locator(`#${appId}`);
        await expect(sheet).toBeVisible();
        await clearScreenOverlays(page, appId);

        const header = sheet.locator('.window-content header').first();
        await expect(header).toContainText('Integrated Weapon');
        await expect(header).toContainText('Eyes');
        await expect(header).toContainText('Organs');
        const text = await sheet.locator('.window-content').innerText();
        expect(text).not.toContain('WH40K.');

        await snap(page, 'cybernetic-sheet-header-type-label', { selector: `#${appId}` });
        recordCoverage('sheet.section', 'cybernetic.header-labels');
    });
});
