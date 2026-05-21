import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

test.describe('roll flows (Tier B)', () => {
    test('ChatMessage.create persists into game.messages (CLAUDE.md gotcha 3a)', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');
        const result = await page.evaluate(async () => {
            const ChatMessageGlobal = (
                globalThis as unknown as {
                    ChatMessage?: { create?: (data: object) => Promise<{ id?: string } | null> };
                    game?: { messages?: { size?: number } };
                }
            ).ChatMessage;
            const msg = await ChatMessageGlobal?.create?.({ content: 'wh40k-rpg-tier-b-probe' });
            const gameGlobal = (globalThis as unknown as { game?: { messages?: { size?: number } } }).game;
            return { id: msg?.id ?? null, count: gameGlobal?.messages?.size ?? 0 };
        });
        expect(result.id).not.toBeNull();
        expect(result.count).toBeGreaterThan(0);
        // The chat sidebar may not be open during a headless run; just verify
        // the message landed in game.messages. The .wh40k-rpg ancestor
        // assertion belongs in a future dedicated spec that opens the chat
        // sidebar first.
    });
});
