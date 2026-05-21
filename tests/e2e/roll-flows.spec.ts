import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

test.describe('roll flows (Tier B)', () => {
    test('ChatMessage.create persists into game.messages (CLAUDE.md gotcha 3a)', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');
        const result = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ChatMessage`/`game` globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                ChatMessage?: { create?: (data: object) => Promise<{ id?: string } | null> };
                game?: { messages?: { size?: number } };
            };
            const msg = await g.ChatMessage?.create?.({ content: 'wh40k-rpg-tier-b-probe' });
            return { id: msg?.id ?? null, count: g.game?.messages?.size ?? 0 };
        });
        expect(result.id).not.toBeNull();
        expect(result.count).toBeGreaterThan(0);
        // The chat sidebar may not be open during a headless run; just verify
        // the message landed in game.messages. The .wh40k-rpg ancestor
        // assertion belongs in a future dedicated spec that opens the chat
        // sidebar first.
    });
});
