import type { Page } from '@playwright/test';
import { type ColorScheme, setColorScheme } from './lib/color-scheme';
import { scanContrast } from './lib/contrast';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #651: the Create Active Effect dialog's colours are tokens, and it
 * stays dark on both themes like every system dialog (#667), declaring the dark
 * surface. Under each colour scheme the dialog is opened from a character sheet,
 * and each category's form is scanned for WCAG AA text contrast, checked for a
 * dark window body and one-line tab labels, and snapped.
 */

interface GameGlobal {
    Actor: { create: (data: object) => Promise<{ id: string } | null> };
    game: {
        actors: {
            get: (
                id: string,
            ) => { sheet: { id: string; render: (o: object) => Promise<object>; close: () => Promise<object> }; delete: () => Promise<object> } | undefined;
        };
    };
}

const EFFECT_DIALOG = '.wh40k-effect-creation-dialog';

type Category = 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';

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
async function checkCategory(page: Page, dialogId: string, scheme: ColorScheme, category: Category): Promise<string[]> {
    const tab = page.locator(`#${dialogId} [data-action="selectCategory"][data-category="${category}"]`);
    await tab.click();
    await expect(tab).toHaveAttribute('data-active', 'true');
    // Off the dialog, so no hover tooltip sits in the capture.
    await page.mouse.move(0, 0);
    const failures = await scanContrast(page, `#${dialogId} .window-content`, 40, { controls: true });
    // Each tab label renders on one line ("CHARACTER-ISTICS" used to break).
    const wrapped = await page
        .locator(`#${dialogId} [data-action="selectCategory"] span`)
        .evaluateAll((labels) => labels.filter((label) => globalThis.wh40kE2E.textLines(label) > 1).map((label) => label.textContent.trim()));
    // The dialog stays dark on both themes (#667): its content's ground is the dark window body.
    const ground = await page.locator(`#${dialogId} .window-content`).evaluate((el) => getComputedStyle(el).backgroundColor);
    await snap(page, `effect-creation-${scheme}-${category}`, { selector: `#${dialogId}` });
    return [
        ...failures.map((f) => `${scheme}/${category}: "${f.text}" ${f.color} on ${f.background} ${f.ratio.toFixed(2)}:1`),
        ...wrapped.map((label) => `${scheme}/${category}: tab label "${label}" wraps`),
        ...(ground === 'rgb(26, 26, 26)' ? [] : [`${scheme}/${category}: window body is ${ground}, not the dark #1a1a1a`]),
    ];
}

/** Under `scheme`, open the dialog and check every category; returns the unreadable text. */
async function checkScheme(page: Page, actorId: string, scheme: ColorScheme): Promise<string[]> {
    await setColorScheme(page, scheme);
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
        const original = await setColorScheme(page, 'dark');
        try {
            // One scheme at a time: changing it re-renders every window.
            const unreadable = [...(await checkScheme(page, actorId, 'light')), ...(await checkScheme(page, actorId, 'dark'))];
            expect(unreadable).toEqual([]);
        } finally {
            await setColorScheme(page, null, original);
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const actor = (globalThis as unknown as GameGlobal).game.actors.get(id);
                await actor?.sheet.close();
                await actor?.delete();
            }, actorId);
        }
    });
});
