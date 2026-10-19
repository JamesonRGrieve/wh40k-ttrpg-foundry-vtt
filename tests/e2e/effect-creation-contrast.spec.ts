import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #651: the Create Active Effect dialog drew its labels, values, hints
 * and tab captions in fixed white, which is unreadable on the light theme's
 * parchment. Its colours are theme tokens now. Under each colour scheme the
 * dialog is opened from a character sheet, and each category's form is scanned
 * for WCAG AA text contrast and snapped.
 */

type Scheme = 'dark' | 'light';

interface UiConfig {
    colorScheme: { applications: string; interface: string };
}

interface GameGlobal {
    Actor: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        settings: { get: (scope: string, key: string) => UiConfig; set: (scope: string, key: string, value: UiConfig) => Promise<object> };
        actors: {
            get: (
                id: string,
            ) => { sheet: { id: string; render: (o: object) => Promise<object>; close: () => Promise<object> }; delete: () => Promise<object> } | undefined;
        };
    };
}

const EFFECT_DIALOG = '.wh40k-effect-creation-dialog';

type Category = 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';

/** Set the client's colour scheme for applications and the interface; returns the config it replaced. */
async function setScheme(page: Page, scheme: Scheme | null, previous?: UiConfig): Promise<UiConfig> {
    return page.evaluate(
        async ({ value, restore }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const { settings } = (globalThis as unknown as GameGlobal).game;
            const current = settings.get('core', 'uiConfig');
            const next = restore ?? { ...current, colorScheme: { applications: value ?? '', interface: value ?? '' } };
            await settings.set('core', 'uiConfig', next);
            return current;
        },
        { value: scheme, restore: previous },
    );
}

/** Open the actor's sheet and its Create Effect dialog; returns the dialog's window id. */
async function openDialog(page: Page, actorId: string): Promise<string> {
    const sheetId = await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const sheet = (globalThis as unknown as GameGlobal).game.actors.get(id)?.sheet;
        if (sheet === undefined) return '';
        await sheet.render({ force: true });
        return sheet.id;
    }, actorId);
    expect(sheetId).not.toBe('');
    await clearScreenOverlays(page, sheetId);
    await page.locator(`#${sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
    await page.locator(`#${sheetId} [data-action="createEffect"]:visible`).first().click();
    const dialog = page.locator(EFFECT_DIALOG).first();
    await expect(dialog).toBeVisible();
    return (await dialog.getAttribute('id')) ?? '';
}

/** Show `category`'s form, scan it (form controls included), and snap the dialog. Returns the unreadable text. */
async function checkCategory(page: Page, dialogId: string, scheme: Scheme, category: Category): Promise<string[]> {
    const tab = page.locator(`#${dialogId} [data-action="selectCategory"][data-category="${category}"]`);
    await tab.click();
    await expect(tab).toHaveAttribute('data-active', 'true');
    // Off the dialog, so no hover tooltip sits in the capture.
    await page.mouse.move(0, 0);
    const failures = await scanContrast(page, `#${dialogId} .window-content`, 40, { controls: true });
    await snap(page, `effect-creation-${scheme}-${category}`, { selector: `#${dialogId}` });
    return failures.map((f) => `${scheme}/${category}: "${f.text}" ${f.color} on ${f.background} ${f.ratio.toFixed(2)}:1`);
}

/** Under `scheme`, open the dialog and check every category; returns the unreadable text. */
async function checkScheme(page: Page, actorId: string, scheme: Scheme): Promise<string[]> {
    await setScheme(page, scheme);
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${scheme}`));
    const dialogId = await openDialog(page, actorId);
    // White-on-transparent condition art sits on an opaque tile, or it vanishes on the light theme.
    const untiled = await page
        .locator(`#${dialogId} [data-field="condition-icon"]`)
        .evaluateAll((icons) =>
            icons.filter((icon) => !getComputedStyle(icon).backgroundColor.startsWith('rgb(')).map((icon) => icon.getAttribute('src') ?? ''),
        );
    expect(untiled, `${scheme}: condition icons without a tile`).toEqual([]);
    const unreadable = [
        ...(await checkCategory(page, dialogId, scheme, 'condition')),
        ...(await checkCategory(page, dialogId, scheme, 'characteristic')),
        ...(await checkCategory(page, dialogId, scheme, 'skill')),
        ...(await checkCategory(page, dialogId, scheme, 'combat')),
        ...(await checkCategory(page, dialogId, scheme, 'custom')),
    ];
    await page.locator(`#${dialogId} [data-action="close"]`).last().click();
    await expect(page.locator(EFFECT_DIALOG)).toHaveCount(0);
    return unreadable;
}

test.describe.serial('Create Active Effect dialog contrast (Tier B, #651)', () => {
    test('every category reads on the light and the dark theme', async ({ page }) => {
        await joinOrSkip(page);
        const actorId = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global is injected by the licensed app; no shipped types
            const actor = await (globalThis as unknown as GameGlobal).Actor.create({
                name: 'e2e-651 Acolyte',
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
            });
            return actor?.id ?? '';
        });
        expect(actorId).not.toBe('');
        const original = await setScheme(page, 'dark');
        try {
            // One scheme at a time: changing it re-renders every window.
            const unreadable = [...(await checkScheme(page, actorId, 'light')), ...(await checkScheme(page, actorId, 'dark'))];
            expect(unreadable).toEqual([]);
        } finally {
            await setScheme(page, null, original);
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const actor = (globalThis as unknown as GameGlobal).game.actors.get(id);
                await actor?.sheet.close();
                await actor?.delete();
            }, actorId);
        }
    });
});
