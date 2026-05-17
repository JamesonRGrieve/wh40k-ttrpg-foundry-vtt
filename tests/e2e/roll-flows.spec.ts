import { expect, test } from '@playwright/test';

test.describe('roll flows (Tier B)', () => {
    test('chat message DOM carries the .wh40k-rpg ancestor class (CLAUDE.md gotcha 3a)', async ({ page }) => {
        await page.goto('/join');
        const select = page.locator('select[name="userid"]');
        const optionCount = (await select.count())
            ? await select.locator('option:not([value=""])').count()
            : 0;
        test.skip(optionCount === 0, 'seed world has no Gamemaster user yet — populate tests/e2e/fixtures/seed-world/data/users.db to enable');
        await select.selectOption({ label: /Gamemaster/i });
        await page.click('button[name="join"]');
        await page.waitForURL(/\/game/);
        await page.waitForFunction(() => {
            const g = (globalThis as unknown as { game?: { ready?: boolean } }).game;
            return g?.ready === true;
        }, undefined, { timeout: 60_000 });
        await page.evaluate(async () => {
            const ChatMessage = (
                globalThis as unknown as {
                    ChatMessage?: { create?: (data: object) => Promise<unknown> };
                }
            ).ChatMessage;
            await ChatMessage?.create?.({ content: '<div class="wh40k-roll-card">probe</div>' });
        });
        const card = page.locator('#chat-log .wh40k-rpg .wh40k-roll-card');
        await expect(card).toBeVisible({ timeout: 5_000 });
    });
});
