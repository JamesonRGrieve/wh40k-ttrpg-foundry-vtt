import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: a panel's root class is on the panel root only (#636).
 *
 * Leaf partials inside panel bodies (drop zone, empty state, caption spans)
 * inherited the panel's `rootClass` hash param, so `wh40k-panel-navigator-powers`
 * and `wh40k-bc-daemon-prince-panel` also matched the drop zone and every caption
 * span. On real sheets each panel class now matches one element, and the inner
 * elements carry their own `wh40k-panel__<role>` class.
 */

const PREFIX = 'e2e-636';

interface ProbeActor {
    id: string;
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; changeTab: (tab: string, group: string) => void };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { filter: (fn: (a: { name: string }) => boolean) => ProbeActor[] } };
}

async function openSheet(page: Page, data: object, tab: string): Promise<string> {
    return page.evaluate(
        async ({ actorData, tabName }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const actor = await w.Actor.create(actorData);
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            actor.sheet.changeTab(tabName, 'primary');
            return actor.sheet.id;
        },
        { actorData: data, tabName: tab },
    );
}

test.describe.serial('panel root classes stay on the panel (Tier B, #636)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const actor of w.game.actors.filter((a) => a.name.startsWith(prefix))) await actor.delete();
        }, PREFIX);
    });

    test('Navigator Powers: one panel element, and the drop zone is its own', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openSheet(
            page,
            {
                name: `${PREFIX} navigator`,
                type: 'rt-character',
                system: { gameSystem: 'rt' },
                items: [{ name: 'e2e Fixture Sight', type: 'navigatorPower', system: {} }],
            },
            'combat',
        );
        const sheet = page.locator(`#${sheetId}`);
        await expect(sheet.locator('.wh40k-panel-navigator-powers')).toHaveCount(1);
        const zone = sheet.locator('.wh40k-panel-navigator-powers .wh40k-panel__dropzone');
        await expect(zone).toHaveCount(1);
        await expect(zone).not.toHaveClass(/wh40k-panel-navigator-powers/);
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'panel-class-leak-navigator-powers', { selector: `#${sheetId} .wh40k-panel-navigator-powers` });
        recordCoverage('panel.render', 'NavigatorPowersPanel.classes');
    });

    test('BC Daemon Prince card: one card element, caption spans carry their own class', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openSheet(page, { name: `${PREFIX} heretic`, type: 'bc-character', system: { gameSystem: 'bc', corruption: 40 } }, 'overview');
        const sheet = page.locator(`#${sheetId}`);
        await expect(sheet.locator('.wh40k-bc-daemon-prince-panel')).toHaveCount(1);
        const captions = sheet.locator('.wh40k-bc-daemon-prince-panel .wh40k-panel__section-label');
        expect(await captions.count()).toBeGreaterThan(0);
        await expect(sheet.locator('.wh40k-panel__section-label.wh40k-bc-daemon-prince-panel')).toHaveCount(0);
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'panel-class-leak-bc-daemon-prince', { selector: `#${sheetId} .wh40k-bc-daemon-prince-panel` });
        recordCoverage('panel.render', 'BcDaemonPrincePanel.classes');
    });
});
