import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: a dialog that belongs to no actor frames itself in the world's primary
 * line, not Rogue Trader's.
 *
 * `{{themeClassFor}}` fell back to a fixed 'rt' when the render named no line.
 * Once Rogue Trader got its void-blue palette, every such dialog (the
 * confirmation dialog among them) drew a blue frame in a Dark Heresy world. The
 * fallback is now the `primary-game-system` world setting; this spec sets it to
 * each of two lines and checks the dialog's frame follows.
 */

const SETTING = 'primary-game-system';
const LINES = ['dh2', 'rt'] as const;
/** The bordered content box inside the confirmation dialog. */
const FRAME = '.window-content div.tw-border-solid';

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    game: { settings: { get: (ns: string, key: string) => string; set: (ns: string, key: string, value: string) => Promise<void> } };
    foundry: { applications: { instances: Map<string, ProbeApp> } };
}

async function setPrimaryLine(page: Page, line: string): Promise<void> {
    await page.evaluate(
        async ({ key, value }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.settings.set('wh40k-rpg', key, value);
        },
        { key: SETTING, value: line },
    );
}

/** Open a ConfirmationDialog and return its id and the border class the line should draw. */
async function openConfirmation(page: Page, line: string): Promise<{ id: string; expected: string }> {
    return page.evaluate(async (systemId) => {
        const dialogUrl = '/systems/wh40k-rpg/module/applications/dialogs/confirmation-dialog.js';
        const themeUrl = '/systems/wh40k-rpg/module/config/game-systems/index.js';
        const dialogModule = (await import(dialogUrl)) as { default: new (config: object) => ProbeApp };
        const themeModule = (await import(themeUrl)) as { themeClassFor: (id: string, role: string) => string };
        const dialog = new dialogModule.default({ title: 'Frame check', content: 'Does this frame follow the world line?' });
        await dialog.render({ force: true });
        return { id: dialog.id, expected: themeModule.themeClassFor(systemId, 'border') };
    }, line);
}

/** The border class another line would draw, read from the built theme module. */
async function borderClassFor(page: Page, line: string): Promise<string> {
    return page.evaluate(async (systemId) => {
        const themeUrl = '/systems/wh40k-rpg/module/config/game-systems/index.js';
        const themeModule = (await import(themeUrl)) as { themeClassFor: (id: string, role: string) => string };
        return themeModule.themeClassFor(systemId, 'border');
    }, line);
}

test.describe.serial('system-agnostic dialogs take the world line (Tier B)', () => {
    let original = 'dh2';

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        original = await page.evaluate((key) => String((globalThis as unknown as ProbeWindow).game.settings.get('wh40k-rpg', key)), SETTING);
    });

    test.afterEach(async ({ page }) => {
        await setPrimaryLine(page, original);
    });

    for (const line of LINES) {
        test(`the confirmation dialog frames in ${line} when the world's line is ${line}`, async ({ page }) => {
            await setPrimaryLine(page, line);
            const { id, expected } = await openConfirmation(page, line);
            const frame = page.locator(`#${id} ${FRAME}`).first();
            await expect(frame).toBeVisible();
            await expect(frame).toHaveClass(new RegExp(`(^|\\s)${expected}(\\s|$)`));
            const other = await borderClassFor(page, line === 'rt' ? 'dh2' : 'rt');
            await expect(frame).not.toHaveClass(new RegExp(`(^|\\s)${other}(\\s|$)`));
            await snap(page, `confirmation-dialog-frame-${line}`, { selector: `#${id}` });
            await page.evaluate(async (appId) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                await (globalThis as unknown as ProbeWindow).foundry.applications.instances.get(appId)?.close();
            }, id);
            recordCoverage('dialog.theme', `ConfirmationDialog.${line}`);
        });
    }
});
