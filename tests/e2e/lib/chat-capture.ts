import type { Page } from '@playwright/test';
import { clearScreenOverlays } from './screenshot';

/**
 * The selector of a chat message's card in the sidebar chat log, after expanding the
 * sidebar onto the Chat tab and scrolling the card into view, for clicking its
 * controls or for `snap(page, label, { selector })`. The `#sidebar` scope skips the
 * transient copy the collapsed sidebar shows over the canvas.
 *
 * For a capture of a LONG card prefer {@link popOutChatMessage}: a card at the
 * bottom of the log runs under the chat input and past the log's scroll box.
 */
export async function showChatMessage(page: Page, messageId: string): Promise<string> {
    // The message element itself: a bare `[data-message-id]` also matched the card's
    // Delete control, which carries the same attribute, so a strict locator failed.
    const selector = `#sidebar .chat-log .message[data-message-id="${messageId}"]`;
    await page.evaluate(async (sel: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ui` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { ui?: { sidebar?: { expanded?: boolean; expand?: () => void; changeTab?: (tab: string, group: string) => void } } };
        if (g.ui?.sidebar?.expanded !== true) g.ui?.sidebar?.expand?.();
        g.ui?.sidebar?.changeTab?.('chat', 'primary');
        const { pollUntil, settle } = globalThis.wh40kE2E;
        await pollUntil(() => document.querySelector(sel) !== null);
        document.querySelector(sel)?.scrollIntoView({ block: 'start' });
        await settle(400);
    }, selector);
    return selector;
}

/**
 * Pop a chat message out into core's chat popout window, close every other floating
 * window, and return the popout's selector for `snap(page, label, { selector })`.
 *
 * The popout renders the same card HTML through the same render hooks, sized to its
 * content, so the whole card is captured; from the sidebar log a long card lost its
 * lower half under the chat input (the Bolas card's "No Damage" note). Falls back to
 * {@link showChatMessage} when the message is not in the world.
 */
export async function popOutChatMessage(page: Page, messageId: string): Promise<string> {
    const appId = await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { messages: { get: (i: string) => object | undefined } };
            CONFIG: {
                ChatMessage: {
                    popoutClass: new (o: { message: object; position: { left: number; top: number } }) => {
                        id: string;
                        rendered: boolean;
                        render: (o: { force: boolean }) => Promise<object>;
                    };
                };
            };
        };
        const message = g.game.messages.get(id);
        if (message === undefined) return null;
        const popout = new g.CONFIG.ChatMessage.popoutClass({ message, position: { left: 420, top: 10 } });
        await popout.render({ force: true });
        const { waitFor, settle, scaledMs } = globalThis.wh40kE2E;
        await waitFor(() => popout.rendered, `chat popout for ${id}`, scaledMs(10_000));
        await settle(400);
        return popout.id;
    }, messageId);
    if (appId === null) {
        return showChatMessage(page, messageId);
    }
    await clearScreenOverlays(page, appId);
    return `#${appId}`;
}
