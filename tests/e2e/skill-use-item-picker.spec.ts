import type { Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #535 — the inline item picker for item-choice skill uses.
 *
 * `ea9bd60d2` moved every skill onto the unified roll dialog but never built the
 * item picker, so Tech-Use Repair, Security Bypass Lock and the other item-choice
 * uses rolled as bare tests and changed nothing. This drives a real dh2-character
 * through the real dialog: pick the use, pick the item in the inline `<select>`,
 * roll, then read the chat card and the item's state.
 *
 * Both rolls use the dialog's own dice, so each test reads which outcome the card
 * reports and asserts the item's state agrees with it.
 */

const ACTOR_NAME = 'e2e-535-item-picker';
const DIALOG = '.unified-roll-dialog';

interface ProbeActor {
    id: string;
    items: { getName: (name: string) => { id: string; system: { state: { broken: boolean; locked: boolean } } } | undefined };
    rollSkill: (key: string) => Promise<void>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        messages: { contents: Array<{ id: string }> };
    };
}

/** Create the probe actor carrying a broken Auspex and a locked Strongbox. */
async function createProbe(page: Page): Promise<void> {
    await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (Actor, game) have no repo types
        const w = globalThis as unknown as ProbeWindow;
        await w.game.actors.getName(name)?.delete();
        await w.Actor.create({
            name,
            type: 'dh2-character',
            system: { gameSystem: 'dh2' },
            items: [
                { name: 'Auspex', type: 'gear', system: { state: { broken: true } } },
                { name: 'Strongbox', type: 'gear', system: { state: { locked: true } } },
            ],
        });
    }, ACTOR_NAME);
}

/** Open the actor's skill roll through the real document API. */
async function openSkill(page: Page, skill: string): Promise<void> {
    // The welcome tour's overlay would otherwise intercept clicks on the dialog.
    await clearScreenOverlays(page);
    await page.evaluate(
        async ({ name, key }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.rollSkill(key);
        },
        { name: ACTOR_NAME, key: skill },
    );
    await expect(page.locator(DIALOG)).toBeVisible();
}

/** The id of the newest chat message: the roll just made. */
async function latestMessageId(page: Page): Promise<string> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        return w.game.messages.contents.at(-1)?.id ?? '';
    });
}

async function itemState(page: Page, itemName: string): Promise<{ broken: boolean; locked: boolean } | null> {
    return page.evaluate(
        ({ name, item }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const state = w.game.actors.getName(name)?.items.getName(item)?.system.state;
            return state === undefined ? null : { broken: state.broken, locked: state.locked };
        },
        { name: ACTOR_NAME, item: itemName },
    );
}

test.describe.serial('skill-use item picker (#535)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
        }, ACTOR_NAME);
    });

    test('Tech-Use Repair: pick the broken item inline, roll, and the card repairs it', async ({ page }) => {
        await joinOrSkip(page);
        await createProbe(page);
        await openSkill(page, 'techUse');
        const dialog = page.locator(DIALOG);

        await dialog.locator('[data-action="selectSkillUse"][data-use-id="repair"]').click();
        const picker = dialog.getByLabel('Item', { exact: true });
        await expect(picker).toBeVisible();
        // Choosing an item-choice use moves keyboard focus to its picker.
        await expect(picker).toBeFocused();
        await expect(picker.locator('option')).toHaveText(['Auspex']);
        await expect(picker).toHaveValue(/.+/);
        await expect(dialog).toContainText('(Auspex)');

        await snap(page, 'repair-item-picker', { selector: DIALOG });

        await dialog.locator('[data-action="systemRoll"]').click();
        await expect(dialog).toHaveCount(0);

        // The selector also matches the card's delete control; narrow it to the card itself.
        const cardSelector = `${await showChatMessage(page, await latestMessageId(page))}.chat-message`;
        const card = page.locator(cardSelector);
        // DH2 RAW (#444): a success repairs it; a failure leaves it broken; 4+ DoF destroys it.
        await expect(card).toContainText(/Auspex is repaired|The repair of Auspex fails|so badly that Auspex is destroyed/);
        const repaired = ((await card.textContent()) ?? '').includes('Auspex is repaired');
        await expect.poll(async () => itemState(page, 'Auspex')).toEqual({ broken: !repaired, locked: false });
        // The untrained base is -20: the card floors the target at 0, matching
        // the dialog's 0%, and says so instead of printing a negative target.
        await expect(card.locator('[data-breakdown-row="floor"]')).toContainText('-20');

        await snap(page, 'repair-chat-card', { selector: cardSelector });
    });

    test('Security Bypass Lock: pick the locked item inline and the card reports on it', async ({ page }) => {
        await joinOrSkip(page);
        await createProbe(page);
        await openSkill(page, 'security');
        const dialog = page.locator(DIALOG);

        await dialog.locator('[data-action="selectSkillUse"][data-use-id="bypassLock"]').click();
        const picker = dialog.getByLabel('Item', { exact: true });
        await expect(picker.locator('option')).toHaveText(['Strongbox']);
        await expect(dialog).toContainText('Pick the locked item to open.');

        await snap(page, 'bypass-lock-item-picker', { selector: DIALOG });

        await dialog.locator('[data-action="systemRoll"]').click();
        await expect(dialog).toHaveCount(0);

        // The selector also matches the card's delete control; narrow it to the card itself.
        const cardSelector = `${await showChatMessage(page, await latestMessageId(page))}.chat-message`;
        const card = page.locator(cardSelector);
        await expect(card).toContainText(/Strongbox is unlocked|The lock on Strongbox holds/);
        const unlocked = ((await card.textContent()) ?? '').includes('Strongbox is unlocked');
        await expect.poll(async () => itemState(page, 'Strongbox')).toEqual({ broken: false, locked: !unlocked });

        await snap(page, 'bypass-lock-chat-card', { selector: cardSelector });
    });
});
